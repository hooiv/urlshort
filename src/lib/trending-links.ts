import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { percentChange, scopeFilter, type AnalyticsScope } from './aggregate-analytics'

/**
 * Trending links: which links gained (or lost) the most human clicks versus the
 * equally long window immediately before. Ranked by absolute change so a link
 * going 2 -> 4 never outranks one going 500 -> 900; links below a minimum
 * volume in both windows are ignored to keep the list free of noise.
 */
export const TRENDING_DAYS_OPTIONS = [1, 7, 14, 30, 90] as const
export const TRENDING_DEFAULT_DAYS = 7
export const TRENDING_MAX_LIMIT = 50
export const TRENDING_DEFAULT_LIMIT = 10
export const TRENDING_MIN_CLICKS = 5
const DAY_MS = 86_400_000

export type TrendingDirection = 'rising' | 'falling'

export function parseTrendingDays(raw: string | null): number | null {
  if (raw === null || raw === '') return TRENDING_DEFAULT_DAYS
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return (TRENDING_DAYS_OPTIONS as readonly number[]).includes(n) ? n : null
}

export function parseTrendingLimit(raw: string | null): number | null {
  if (raw === null || raw === '') return TRENDING_DEFAULT_LIMIT
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return n >= 1 && n <= TRENDING_MAX_LIMIT ? n : null
}

export function parseTrendingDirection(raw: string | null): TrendingDirection | null {
  if (raw === null || raw === '') return 'rising'
  return raw === 'rising' || raw === 'falling' ? raw : null
}

export type TrendingRow = {
  id: string
  shortCode: string
  title: string | null
  originalUrl: string
  clicks: number
  previousClicks: number
  delta: number
  changePercent: number | null
}

type RawRow = { id: string; shortCode: string; title: string | null; originalUrl: string; current: bigint | number; previous: bigint | number }

/** Pure: turn raw counts into ranked rows (also used by the integration path). */
export function rankTrending(rows: RawRow[], direction: TrendingDirection, limit: number, minClicks = TRENDING_MIN_CLICKS): TrendingRow[] {
  return rows
    .map((r) => {
      const clicks = Number(r.current)
      const previousClicks = Number(r.previous)
      return { id: r.id, shortCode: r.shortCode, title: r.title, originalUrl: r.originalUrl, clicks, previousClicks, delta: clicks - previousClicks, changePercent: percentChange(clicks, previousClicks) }
    })
    .filter((r) => Math.max(r.clicks, r.previousClicks) >= minClicks)
    .filter((r) => (direction === 'rising' ? r.delta > 0 : r.delta < 0))
    .sort((a, b) => (direction === 'rising' ? b.delta - a.delta : a.delta - b.delta) || b.clicks - a.clicks || a.shortCode.localeCompare(b.shortCode))
    .slice(0, limit)
}

export async function getTrendingLinks(
  scope: AnalyticsScope,
  opts: { days: number; direction: TrendingDirection; limit: number },
  now = new Date(),
): Promise<{ days: number; direction: TrendingDirection; links: TrendingRow[] }> {
  const currentFrom = new Date(now.getTime() - opts.days * DAY_MS)
  const previousFrom = new Date(now.getTime() - 2 * opts.days * DAY_MS)
  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT u."id", u."shortCode", u."title", u."originalUrl",
      COUNT(*) FILTER (WHERE c."createdAt" >= ${currentFrom}) AS "current",
      COUNT(*) FILTER (WHERE c."createdAt" < ${currentFrom}) AS "previous"
    FROM "click_events" c
    JOIN "urls" u ON u."id" = c."urlId"
    WHERE ${scopeFilter(scope)}
      AND c."trafficType" = 'human'
      AND c."createdAt" >= ${previousFrom} AND c."createdAt" <= ${now}
    GROUP BY u."id", u."shortCode", u."title", u."originalUrl"`)
  return { days: opts.days, direction: opts.direction, links: rankTrending(rows, opts.direction, opts.limit) }
}
