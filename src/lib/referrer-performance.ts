import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter } from './aggregate-analytics'

/**
 * Referrer performance: human clicks and unique visitors per referring host in a workspace over a window
 * versus the equal window before. Direct traffic (no referrer host) is left out; "www." is folded away.
 * Viewers only see links they may access.
 */
export const REFERRER_WINDOW_OPTIONS = [7, 30, 90] as const
export const REFERRER_DEFAULT_WINDOW = 30
export const REFERRER_MAX_ROWS = 250
const DAY_MS = 86_400_000

export function parseReferrerWindow(raw: string | null): number | null {
  if (raw === null || raw === '') return REFERRER_DEFAULT_WINDOW
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return (REFERRER_WINDOW_OPTIONS as readonly number[]).includes(n) ? n : null
}

export type ReferrerStat = {
  host: string
  clicks: number
  visitors: number
  previousClicks: number
  changePct: number | null
  sharePct: number
}

type RawRow = { host: string | null; clicks: bigint | number; visitors: bigint | number; previous: bigint | number }

export function normalizeHost(raw: string | null): string | null {
  const h = (raw ?? '').trim().toLowerCase().replace(/\.$/, '').replace(/^www\./, '')
  return h && /^[a-z0-9.-]+$/.test(h) ? h : null
}

export function shapeReferrerStats(rows: RawRow[]): ReferrerStat[] {
  const merged = new Map<string, Omit<ReferrerStat, 'changePct' | 'sharePct'>>()
  for (const r of rows) {
    const host = normalizeHost(r.host)
    if (!host) continue
    const cur = merged.get(host) ?? { host, clicks: 0, visitors: 0, previousClicks: 0 }
    cur.clicks += Number(r.clicks)
    cur.visitors += Number(r.visitors)
    cur.previousClicks += Number(r.previous)
    merged.set(host, cur)
  }
  const parsed = [...merged.values()].filter((r) => r.clicks > 0 || r.previousClicks > 0)
  const total = parsed.reduce((s, r) => s + r.clicks, 0)
  return parsed
    .map((r) => ({
      ...r,
      changePct: r.previousClicks > 0 ? Math.round(((r.clicks - r.previousClicks) / r.previousClicks) * 1000) / 10 : null,
      sharePct: total > 0 ? Math.round((r.clicks / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.clicks - a.clicks || a.host.localeCompare(b.host))
}

export async function getReferrerPerformance(
  workspaceId: string,
  viewer: { userId: string } | undefined,
  days: number,
  now = new Date(),
) {
  const end = now
  const start = new Date(end.getTime() - days * DAY_MS)
  const prevStart = new Date(start.getTime() - days * DAY_MS)
  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT REGEXP_REPLACE(LOWER(BTRIM(c."referrerHost")), '^www\\.', '') AS "host",
      COUNT(*) FILTER (WHERE c."createdAt" >= ${start}) AS "clicks",
      COUNT(DISTINCT c."visitorIdHash") FILTER (WHERE c."createdAt" >= ${start}) AS "visitors",
      COUNT(*) FILTER (WHERE c."createdAt" < ${start}) AS "previous"
    FROM "click_events" c
    JOIN "urls" u ON u."id" = c."urlId"
    WHERE c."trafficType" = 'human' AND c."referrerHost" IS NOT NULL AND BTRIM(c."referrerHost") <> ''
      AND c."createdAt" >= ${prevStart} AND c."createdAt" < ${end}
      AND ${scopeFilter({ kind: 'workspace', workspaceId, viewer })}
    GROUP BY 1
    ORDER BY "clicks" DESC
    LIMIT ${REFERRER_MAX_ROWS}`)
  return { days, from: start.toISOString(), to: end.toISOString(), referrers: shapeReferrerStats(rows) }
}
