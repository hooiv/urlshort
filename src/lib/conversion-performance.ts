import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter } from './aggregate-analytics'

/**
 * Conversion performance: per link in a workspace, human clicks, conversions, conversion rate and revenue
 * (summed per currency, never mixed) over a window versus the equal window before.
 * Viewers only see links they may access.
 */
export const CONVERSION_WINDOW_OPTIONS = [7, 30, 90] as const
export const CONVERSION_DEFAULT_WINDOW = 30
export const CONVERSION_MAX_ROWS = 250
const DAY_MS = 86_400_000

export function parseConversionWindow(raw: string | null): number | null {
  if (raw === null || raw === '') return CONVERSION_DEFAULT_WINDOW
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return (CONVERSION_WINDOW_OPTIONS as readonly number[]).includes(n) ? n : null
}

export type ConversionStat = {
  shortCode: string
  clicks: number
  conversions: number
  previousConversions: number
  conversionRatePct: number | null
  changePct: number | null
  revenue: { currency: string; cents: number }[]
}

export type RawConversionRow = {
  shortCode: string
  clicks: bigint | number
  conversions: bigint | number
  previous: bigint | number
  revenue: unknown
}

function parseRevenue(raw: unknown): { currency: string; cents: number }[] {
  let value = raw
  if (typeof value === 'string') {
    try { value = JSON.parse(value) } catch { return [] }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  return Object.entries(value as Record<string, unknown>)
    .map(([currency, cents]) => ({ currency: currency.toUpperCase(), cents: Number(cents) }))
    .filter((r) => /^[A-Z]{3}$/.test(r.currency) && Number.isFinite(r.cents) && r.cents !== 0)
    .sort((a, b) => b.cents - a.cents || a.currency.localeCompare(b.currency))
}

export function shapeConversionStats(rows: RawConversionRow[]): ConversionStat[] {
  return rows
    .map((r) => {
      const clicks = Number(r.clicks)
      const conversions = Number(r.conversions)
      const previousConversions = Number(r.previous)
      return {
        shortCode: r.shortCode,
        clicks,
        conversions,
        previousConversions,
        // Conversions can be attributed to clicks outside the window, so cap at 100% rather than show nonsense.
        conversionRatePct: clicks > 0 ? Math.min(100, Math.round((conversions / clicks) * 1000) / 10) : null,
        changePct: previousConversions > 0 ? Math.round(((conversions - previousConversions) / previousConversions) * 1000) / 10 : null,
        revenue: parseRevenue(r.revenue),
      }
    })
    .filter((r) => r.conversions > 0 || r.previousConversions > 0)
    .sort((a, b) => b.conversions - a.conversions || a.shortCode.localeCompare(b.shortCode))
}

export async function getConversionPerformance(
  workspaceId: string,
  viewer: { userId: string } | undefined,
  days: number,
  now = new Date(),
) {
  const end = now
  const start = new Date(end.getTime() - days * DAY_MS)
  const prevStart = new Date(start.getTime() - days * DAY_MS)
  const rows = await prisma.$queryRaw<RawConversionRow[]>(Prisma.sql`
    WITH scoped AS (
      SELECT u."id", u."shortCode" FROM "urls" u
      WHERE ${scopeFilter({ kind: 'workspace', workspaceId, viewer })}
    ),
    clicks AS (
      SELECT c."urlId", COUNT(*) AS "clicks"
      FROM "click_events" c JOIN scoped s ON s."id" = c."urlId"
      WHERE c."trafficType" = 'human' AND c."createdAt" >= ${start} AND c."createdAt" < ${end}
      GROUP BY c."urlId"
    ),
    conv AS (
      SELECT v."urlId",
        COUNT(*) FILTER (WHERE v."createdAt" >= ${start}) AS "conversions",
        COUNT(*) FILTER (WHERE v."createdAt" < ${start}) AS "previous"
      FROM "conversion_events" v JOIN scoped s ON s."id" = v."urlId"
      WHERE v."createdAt" >= ${prevStart} AND v."createdAt" < ${end}
      GROUP BY v."urlId"
    ),
    rev AS (
      SELECT x."urlId", JSONB_OBJECT_AGG(x."currency", x."cents") AS "revenue"
      FROM (
        SELECT v."urlId", UPPER(v."currency") AS "currency", SUM(v."valueCents") AS "cents"
        FROM "conversion_events" v JOIN scoped s ON s."id" = v."urlId"
        WHERE v."createdAt" >= ${start} AND v."createdAt" < ${end}
          AND v."valueCents" IS NOT NULL AND v."currency" IS NOT NULL
        GROUP BY v."urlId", UPPER(v."currency")
      ) x GROUP BY x."urlId"
    )
    SELECT s."shortCode", COALESCE(k."clicks", 0) AS "clicks", cv."conversions", cv."previous", r."revenue"
    FROM conv cv
    JOIN scoped s ON s."id" = cv."urlId"
    LEFT JOIN clicks k ON k."urlId" = cv."urlId"
    LEFT JOIN rev r ON r."urlId" = cv."urlId"
    ORDER BY cv."conversions" DESC, s."shortCode"
    LIMIT ${CONVERSION_MAX_ROWS}`)
  return { days, from: start.toISOString(), to: end.toISOString(), links: shapeConversionStats(rows) }
}
