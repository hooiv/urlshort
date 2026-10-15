import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter, type AnalyticsScope } from './aggregate-analytics'

/**
 * Link lifespan: how front-loaded a link's traffic is. Compares the share of a
 * link's human clicks that landed in its first 48 hours of traffic against the
 * rest, so owners can tell campaign bursts (worth re-promoting) from evergreen
 * links (worth keeping stable). Needs LIFESPAN_MIN_CLICKS clicks and at least
 * LIFESPAN_MIN_AGE_DAYS days since the first click to avoid judging new links.
 */
export const LIFESPAN_MIN_CLICKS = 50
export const LIFESPAN_MIN_AGE_DAYS = 7
export const LIFESPAN_MAX_LIMIT = 100
export const LIFESPAN_DEFAULT_LIMIT = 25
const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

export type LifespanPattern = 'burst' | 'balanced' | 'evergreen'

export function parseLifespanLimit(raw: string | null): number | null {
  if (raw === null || raw === '') return LIFESPAN_DEFAULT_LIMIT
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return n >= 1 && n <= LIFESPAN_MAX_LIMIT ? n : null
}

/** earlyShare = clicks in first 48h of traffic / total clicks. */
export function classifyLifespan(earlyShare: number): LifespanPattern {
  if (earlyShare >= 0.7) return 'burst'
  if (earlyShare <= 0.25) return 'evergreen'
  return 'balanced'
}

export type LinkLifespan = {
  id: string
  shortCode: string
  title: string | null
  originalUrl: string
  totalClicks: number
  earlyClicks: number
  earlyShare: number
  lastWeekClicks: number
  pattern: LifespanPattern
}

type RawRow = {
  id: string; shortCode: string; title: string | null; originalUrl: string
  total: bigint | number; early: bigint | number; lastWeek: bigint | number; firstClick: Date
}

export function shapeLifespans(rows: RawRow[], now: Date): LinkLifespan[] {
  const out: LinkLifespan[] = []
  for (const r of rows) {
    const total = Number(r.total)
    if (total < LIFESPAN_MIN_CLICKS) continue
    if (now.getTime() - r.firstClick.getTime() < LIFESPAN_MIN_AGE_DAYS * DAY_MS) continue
    const early = Number(r.early)
    const share = early / total
    out.push({
      id: r.id, shortCode: r.shortCode, title: r.title, originalUrl: r.originalUrl,
      totalClicks: total, earlyClicks: early,
      earlyShare: Math.round(share * 1000) / 1000,
      lastWeekClicks: Number(r.lastWeek),
      pattern: classifyLifespan(share),
    })
  }
  return out.sort((a, b) => b.earlyShare - a.earlyShare || b.totalClicks - a.totalClicks || a.shortCode.localeCompare(b.shortCode))
}

export async function getLinkLifespans(scope: AnalyticsScope, opts: { limit: number }, now = new Date()) {
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS)
  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    WITH first AS (
      SELECT c."urlId", MIN(c."createdAt") AS "firstClick"
      FROM "click_events" c JOIN "urls" u ON u."id" = c."urlId"
      WHERE ${scopeFilter(scope)} AND c."trafficType" = 'human' AND c."createdAt" <= ${now}
      GROUP BY c."urlId"
    )
    SELECT u."id", u."shortCode", u."title", u."originalUrl", f."firstClick",
      COUNT(*) AS "total",
      COUNT(*) FILTER (WHERE c."createdAt" < f."firstClick" + interval '48 hours') AS "early",
      COUNT(*) FILTER (WHERE c."createdAt" >= ${weekAgo}) AS "lastWeek"
    FROM first f
    JOIN "urls" u ON u."id" = f."urlId"
    JOIN "click_events" c ON c."urlId" = u."id" AND c."trafficType" = 'human' AND c."createdAt" <= ${now}
    WHERE u."isActive" = true
    GROUP BY u."id", f."firstClick"
    HAVING COUNT(*) >= ${LIFESPAN_MIN_CLICKS}
    LIMIT 2000`)
  const all = shapeLifespans(rows, now)
  return { minClicks: LIFESPAN_MIN_CLICKS, minAgeDays: LIFESPAN_MIN_AGE_DAYS, truncated: all.length > opts.limit, links: all.slice(0, opts.limit) }
}
