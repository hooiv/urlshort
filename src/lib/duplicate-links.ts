import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { TRACKING_PARAMS } from './tracking-params'
import { scopeFilter, type AnalyticsScope } from './aggregate-analytics'

/**
 * Duplicate destinations: groups of active links pointing at the same page.
 * URLs are normalised (case-insensitive scheme/host, default ports, fragment,
 * trailing slash, www., sorted query string, tracking params dropped) so
 * `https://WWW.Example.com/a/?b=2&a=1&utm_source=x#top` equals
 * `https://example.com/a?a=1&b=2`.
 */
export const DUPLICATES_MAX_GROUPS = 100
export const DUPLICATES_DEFAULT_GROUPS = 25
export const DUPLICATES_MAX_SCAN = 20_000
const TRACKING_SET = new Set<string>(TRACKING_PARAMS)
const TRACKING = { test: (k: string) => /^utm_/i.test(k) || TRACKING_SET.has(k.toLowerCase()) || /^(mc_cid|ref_src)$/i.test(k) }

export function normalizeDestination(raw: string): string | null {
  let u: URL
  try { u = new URL(raw.trim()) } catch { return null }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  const host = u.hostname.toLowerCase().replace(/^www\./, '')
  const port = u.port && !((u.protocol === 'http:' && u.port === '80') || (u.protocol === 'https:' && u.port === '443')) ? `:${u.port}` : ''
  const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, '') : ''
  const params = [...u.searchParams.entries()].filter(([k]) => !TRACKING.test(k))
    .sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)))
  const query = params.length ? `?${params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')}` : ''
  return `${host}${port}${path}${query}`
}

export type DuplicateLink = { id: string; shortCode: string; title: string | null; originalUrl: string; clicks: number; createdAt: string }
export type DuplicateGroup = { destination: string; count: number; totalClicks: number; keep: string; links: DuplicateLink[] }
type Row = { id: string; shortCode: string; title: string | null; originalUrl: string; clicks: number; createdAt: Date }

/** Pure grouping. `keep` is the most-clicked link (oldest wins ties) - the natural survivor when merging. */
export function groupDuplicates(rows: Row[], limit: number): DuplicateGroup[] {
  const map = new Map<string, Row[]>()
  for (const r of rows) {
    const key = normalizeDestination(r.originalUrl)
    if (!key) continue
    const list = map.get(key)
    if (list) list.push(r); else map.set(key, [r])
  }
  const groups: DuplicateGroup[] = []
  for (const [destination, list] of map) {
    if (list.length < 2) continue
    list.sort((a, b) => b.clicks - a.clicks || a.createdAt.getTime() - b.createdAt.getTime() || a.shortCode.localeCompare(b.shortCode))
    groups.push({
      destination, count: list.length, totalClicks: list.reduce((s, l) => s + l.clicks, 0), keep: list[0].id,
      links: list.map((l) => ({ id: l.id, shortCode: l.shortCode, title: l.title, originalUrl: l.originalUrl, clicks: l.clicks, createdAt: l.createdAt.toISOString() })),
    })
  }
  return groups.sort((a, b) => b.count - a.count || b.totalClicks - a.totalClicks || a.destination.localeCompare(b.destination)).slice(0, limit)
}

export function parseDuplicatesLimit(raw: string | null): number | null {
  if (raw === null || raw === '') return DUPLICATES_DEFAULT_GROUPS
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return n >= 1 && n <= DUPLICATES_MAX_GROUPS ? n : null
}

export async function findDuplicateLinks(scope: AnalyticsScope, limit: number) {
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT u."id", u."shortCode", u."title", u."originalUrl", u."clicks", u."createdAt"
    FROM "urls" u
    WHERE ${scopeFilter(scope)} AND u."isActive" = true
    ORDER BY u."createdAt" DESC
    LIMIT ${DUPLICATES_MAX_SCAN + 1}`)
  const truncated = rows.length > DUPLICATES_MAX_SCAN
  const groups = groupDuplicates(truncated ? rows.slice(0, DUPLICATES_MAX_SCAN) : rows, limit)
  return { groups, truncated, scanned: Math.min(rows.length, DUPLICATES_MAX_SCAN) }
}

/** Short codes to archive when keeping one link of a duplicate group (never the kept one). */
export function archiveTargets(group: Pick<DuplicateGroup, 'links'>, keepId: string): string[] {
  if (!group.links.some((l) => l.id === keepId)) return []
  return group.links.filter((l) => l.id !== keepId).map((l) => l.shortCode)
}
