import { Prisma } from '@prisma/client'
import { prisma } from './prisma'

/**
 * Per-link new vs returning visitors, from the privacy-preserving visitorIdHash.
 * A visitor is "returning" in the window if their hash was seen on this link
 * before the window started OR on an earlier day inside it.
 * Clicks without a hash are reported separately and excluded from the split.
 */
export const VISITOR_MAX_DAYS = 365
export const VISITOR_DEFAULT_DAYS = 30
const DAY_MS = 86_400_000

export function parseVisitorDays(raw: string | null): number | null {
  if (raw === null || raw === '') return VISITOR_DEFAULT_DAYS
  if (!/^\d{1,4}$/.test(raw)) return null
  const n = Number(raw)
  return n >= 1 && n <= VISITOR_MAX_DAYS ? n : null
}

export type VisitorRetention = {
  days: number
  uniqueVisitors: number
  newVisitors: number
  returningVisitors: number
  returningRate: number
  clicksPerVisitor: number
  anonymousClicks: number
}

/** Pure: derive rates from raw counts. */
export function buildVisitorRetention(
  c: { days: number; uniqueVisitors: number; returningVisitors: number; hashedClicks: number; anonymousClicks: number },
): VisitorRetention {
  const unique = Math.max(0, c.uniqueVisitors)
  const returning = Math.min(Math.max(0, c.returningVisitors), unique)
  const round = (n: number) => Math.round(n * 10) / 10
  return {
    days: c.days,
    uniqueVisitors: unique,
    newVisitors: unique - returning,
    returningVisitors: returning,
    returningRate: unique ? round((returning / unique) * 100) : 0,
    clicksPerVisitor: unique ? Math.round((c.hashedClicks / unique) * 100) / 100 : 0,
    anonymousClicks: Math.max(0, c.anonymousClicks),
  }
}

export async function getVisitorRetention(urlId: string, days: number, now = new Date()): Promise<VisitorRetention> {
  const since = new Date(now.getTime() - days * DAY_MS)
  const rows = await prisma.$queryRaw<Array<{ unique_visitors: bigint; returning_visitors: bigint; hashed_clicks: bigint; anonymous: bigint }>>(Prisma.sql`
    WITH w AS (
      SELECT "visitorIdHash" AS v, "createdAt" AS t
      FROM "click_events"
      WHERE "urlId" = ${urlId} AND "createdAt" >= ${since} AND "createdAt" <= ${now} AND "trafficType" = 'human'
    ), per AS (
      SELECT v, COUNT(*) AS n, COUNT(DISTINCT (t AT TIME ZONE 'UTC')::date) AS dcount
      FROM w WHERE v IS NOT NULL GROUP BY v
    )
    SELECT
      (SELECT COUNT(*) FROM per) AS unique_visitors,
      (SELECT COUNT(*) FROM per p WHERE p.dcount > 1 OR EXISTS (
        SELECT 1 FROM "click_events" e WHERE e."urlId" = ${urlId} AND e."visitorIdHash" = p.v AND e."createdAt" < ${since} AND e."trafficType" = 'human')) AS returning_visitors,
      (SELECT COALESCE(SUM(n), 0) FROM per) AS hashed_clicks,
      (SELECT COUNT(*) FROM w WHERE v IS NULL) AS anonymous`)
  const r = rows[0]
  return buildVisitorRetention({
    days,
    uniqueVisitors: Number(r?.unique_visitors ?? 0),
    returningVisitors: Number(r?.returning_visitors ?? 0),
    hashedClicks: Number(r?.hashed_clicks ?? 0),
    anonymousClicks: Number(r?.anonymous ?? 0),
  })
}
