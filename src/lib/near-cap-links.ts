import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter, type AnalyticsScope } from './aggregate-analytics'

/**
 * Links about to hit their click cap: active, capped, at or above the given
 * share of maxClicks but not yet over it. Closest to the cap first, so owners
 * can raise the limit before visitors start getting the fallback page.
 */
export const NEAR_CAP_MAX = 200
export const NEAR_CAP_DEFAULT = 50
export const NEAR_CAP_DEFAULT_THRESHOLD = 80

export type NearCapLink = {
  id: string; shortCode: string; title: string | null; originalUrl: string
  clicks: number; maxClicks: number; percentUsed: number; remaining: number
}

export function parseNearCapLimit(raw: string | null): number | null {
  if (raw === null || raw === '') return NEAR_CAP_DEFAULT
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return n >= 1 && n <= NEAR_CAP_MAX ? n : null
}

/** Threshold is a whole percent from 1 to 99. */
export function parseNearCapThreshold(raw: string | null): number | null {
  if (raw === null || raw === '') return NEAR_CAP_DEFAULT_THRESHOLD
  if (!/^\d{1,2}$/.test(raw)) return null
  const n = Number(raw)
  return n >= 1 && n <= 99 ? n : null
}

export function capUsage(clicks: number, maxClicks: number) {
  const percentUsed = maxClicks > 0 ? Math.floor((clicks / maxClicks) * 100) : 100
  return { percentUsed, remaining: Math.max(0, maxClicks - clicks) }
}

type Row = { id: string; shortCode: string; title: string | null; originalUrl: string; clicks: number; maxClicks: number }

export async function findNearCapLinks(scope: AnalyticsScope, limit: number, thresholdPercent: number) {
  // Integer arithmetic keeps the threshold exact: clicks*100 >= max*threshold.
  const where = Prisma.sql`${scopeFilter(scope)} AND u."isActive" = true AND u."maxClicks" IS NOT NULL AND u."maxClicks" > 0 AND u."clicks" < u."maxClicks" AND u."clicks"::bigint * 100 >= u."maxClicks"::bigint * ${thresholdPercent}`
  const [rows, counts] = await Promise.all([
    prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT u."id", u."shortCode", u."title", u."originalUrl", u."clicks", u."maxClicks"
      FROM "urls" u WHERE ${where}
      ORDER BY (u."maxClicks" - u."clicks") ASC, u."shortCode" ASC LIMIT ${limit}`),
    prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`SELECT COUNT(*) AS n FROM "urls" u WHERE ${where}`),
  ])
  const links: NearCapLink[] = rows.map((r) => ({ ...r, ...capUsage(r.clicks, r.maxClicks) }))
  return { links, total: Number(counts[0]?.n ?? 0) }
}
