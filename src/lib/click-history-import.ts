import type { PrismaClient } from '@prisma/client'

/**
 * Brings a link's pre-migration click history over from Bitly as daily
 * counts in ClickDaily. Idempotent without extra schema: days are SET (never
 * incremented), and a day that already has a row (native clicks, or an earlier
 * import) is left alone, so re-running or running after go-live can't double count.
 */

export type DailyClicks = { dateKey: string; clicks: number }
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

const BITLINK_ID = /^[A-Za-z0-9.-]{1,100}\/[A-Za-z0-9_-]{1,100}$/
const MAX_DAYS = 365

/** Normalises Bitly `link_clicks` entries ({date, clicks}) into UTC day keys, merging duplicates and dropping junk. */
export function normalizeBitlyClicks(entries: unknown, now = new Date()): DailyClicks[] {
  const today = now.toISOString().slice(0, 10)
  const byDay = new Map<string, number>()
  for (const e of Array.isArray(entries) ? entries : []) {
    const { date, clicks } = (e ?? {}) as { date?: unknown; clicks?: unknown }
    const t = typeof date === 'string' ? Date.parse(date) : NaN
    if (!Number.isFinite(t) || typeof clicks !== 'number' || !Number.isInteger(clicks) || clicks <= 0) continue
    const dateKey = new Date(t).toISOString().slice(0, 10)
    if (dateKey > today) continue
    byDay.set(dateKey, (byDay.get(dateKey) ?? 0) + clicks)
  }
  return [...byDay].map(([dateKey, clicks]) => ({ dateKey, clicks })).sort((a, b) => a.dateKey.localeCompare(b.dateKey))
}

/** Fetches up to a year of daily clicks for one bitlink (e.g. "bit.ly/abc123"). The token is used for this call only. */
export async function fetchBitlyDailyClicks(token: string, bitlinkId: string, fetchImpl: FetchLike = (i, o) => fetch(i, o)): Promise<DailyClicks[]> {
  if (!BITLINK_ID.test(bitlinkId)) throw new Error('Invalid bitlink id')
  const q = new URLSearchParams({ unit: 'day', units: String(MAX_DAYS) })
  const res = await fetchImpl(`https://api-ssl.bitly.com/v4/bitlinks/${bitlinkId}/clicks?${q}`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
    redirect: 'error',
  })
  if (res.status === 401 || res.status === 403) throw new Error('Bitly rejected the token')
  if (!res.ok) throw new Error(`Bitly returned an error (${res.status})`)
  const body = (await res.json().catch(() => ({}))) as { link_clicks?: unknown }
  return normalizeBitlyClicks(body.link_clicks)
}

const SHORT_LINK_ID = /^[A-Za-z0-9_-]{4,64}$/

/** Normalises Short.io statistics datasets ({x: date, y: count}, y may be a string) into UTC day keys. */
export function normalizeShortIoClicks(body: unknown, now = new Date()): DailyClicks[] {
  const datasets = (body as { clickStatistics?: { datasets?: unknown } } | null)?.clickStatistics?.datasets
  const first = Array.isArray(datasets) ? (datasets[0] as { data?: unknown } | undefined) : undefined
  const entries = Array.isArray(first?.data) ? first.data : []
  return normalizeBitlyClicks(
    entries.map((e) => {
      const { x, y } = (e ?? {}) as { x?: unknown; y?: unknown }
      const n = typeof y === 'string' && /^\d{1,12}$/.test(y) ? Number(y) : y
      return { date: x, clicks: n }
    }),
    now,
  )
}

/** Fetches up to a year of daily clicks for one Short.io link id (e.g. "lnk_abc..."). The key is used for this call only. */
export async function fetchShortIoDailyClicks(secretKey: string, linkId: string, fetchImpl: FetchLike = (i, o) => fetch(i, o), now = new Date()): Promise<DailyClicks[]> {
  if (!SHORT_LINK_ID.test(linkId)) throw new Error('Invalid Short.io link id')
  const end = now.toISOString().slice(0, 10)
  const start = new Date(now.getTime() - MAX_DAYS * 86_400_000).toISOString().slice(0, 10)
  const q = new URLSearchParams({ period: 'custom', startDate: start, endDate: end, tz: 'UTC' })
  const res = await fetchImpl(`https://statistics.short.io/statistics/link/${linkId}?${q}`, {
    headers: { authorization: secretKey, accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
    redirect: 'error',
  })
  if (res.status === 401 || res.status === 403) throw new Error('Short.io rejected the token')
  if (!res.ok) throw new Error(`Short.io returned an error (${res.status})`)
  return normalizeShortIoClicks(await res.json().catch(() => ({})), now)
}

/** Writes history for one link; returns how many days were added and how many were skipped as already present. */
export async function applyDailyHistory(db: Pick<PrismaClient, 'clickDaily' | 'url'>, urlId: string, series: DailyClicks[]): Promise<{ added: number; skipped: number; clicks: number }> {
  if (series.length === 0) return { added: 0, skipped: 0, clicks: 0 }
  const existing = await db.clickDaily.findMany({ where: { urlId, dateKey: { in: series.map((s) => s.dateKey) } }, select: { dateKey: true } })
  const have = new Set(existing.map((r) => r.dateKey))
  const fresh = series.filter((s) => !have.has(s.dateKey))
  if (fresh.length === 0) return { added: 0, skipped: series.length, clicks: 0 }
  const created = await db.clickDaily.createMany({ data: fresh.map((s) => ({ urlId, dateKey: s.dateKey, clicks: s.clicks })), skipDuplicates: true })
  const clicks = fresh.reduce((n, s) => n + s.clicks, 0)
  // Only bump the lifetime counter when rows really landed (a concurrent run may have won the race).
  if (created.count === fresh.length) await db.url.update({ where: { id: urlId }, data: { clicks: { increment: clicks } } })
  return { added: created.count, skipped: series.length - created.count, clicks }
}
