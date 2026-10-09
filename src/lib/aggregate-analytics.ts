import { Prisma } from '@prisma/client'
import { prisma } from './prisma'

/**
 * Aggregated analytics across many links: everything a user owns, a whole
 * workspace, or one tag within either. Totals and the time series read the
 * pre-aggregated daily tables, so cost scales with links × days, not clicks.
 * Breakdowns scan raw click events and are therefore capped to 90 days.
 */

export const MAX_RANGE_DAYS = 366
export const MAX_BREAKDOWN_DAYS = 90
const DAY_MS = 86_400_000

export type AnalyticsScope =
  | { kind: 'user'; userId: string; tag?: string }
  | { kind: 'workspace'; workspaceId: string; tag?: string }

export type AnalyticsWindow = { from: string; to: string; days: number }

const PRESETS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 }
const DATE = /^\d{4}-\d{2}-\d{2}$/

const toKey = (date: Date) => date.toISOString().slice(0, 10)

/** Inclusive UTC date-key window. Throws on invalid or oversized ranges. */
export function resolveWindow(params: { range?: string | null; from?: string | null; to?: string | null }, now = new Date()): AnalyticsWindow {
  if (params.from || params.to) {
    const to = params.to ?? toKey(now)
    if (!DATE.test(to) || (params.from && !DATE.test(params.from))) throw new Error('Dates must be YYYY-MM-DD')
    const toDate = new Date(`${to}T00:00:00Z`)
    const fromDate = params.from ? new Date(`${params.from}T00:00:00Z`) : new Date(toDate.getTime() - 29 * DAY_MS)
    if (Number.isNaN(toDate.getTime()) || Number.isNaN(fromDate.getTime()) || fromDate > toDate) throw new Error('Invalid date range')
    const days = Math.round((toDate.getTime() - fromDate.getTime()) / DAY_MS) + 1
    if (days > MAX_RANGE_DAYS) throw new Error(`Date range too large (max ${MAX_RANGE_DAYS} days)`)
    return { from: toKey(fromDate), to, days }
  }
  const days = PRESETS[params.range ?? '30d'] ?? 30
  const toDate = new Date(`${toKey(now)}T00:00:00Z`)
  return { from: toKey(new Date(toDate.getTime() - (days - 1) * DAY_MS)), to: toKey(toDate), days }
}

/** The equally long window immediately before, for period-over-period deltas. */
export function previousWindow(window: AnalyticsWindow): AnalyticsWindow {
  const from = new Date(`${window.from}T00:00:00Z`)
  return { from: toKey(new Date(from.getTime() - window.days * DAY_MS)), to: toKey(new Date(from.getTime() - DAY_MS)), days: window.days }
}

export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null
  return Math.round(((current - previous) / previous) * 1000) / 10
}

/** Every date key in the window, so the series has no gaps for charting. */
export function dateKeys(window: AnalyticsWindow): string[] {
  const keys: string[] = []
  for (let t = new Date(`${window.from}T00:00:00Z`).getTime(); t <= new Date(`${window.to}T00:00:00Z`).getTime(); t += DAY_MS) keys.push(toKey(new Date(t)))
  return keys
}

function scopeFilter(scope: AnalyticsScope): Prisma.Sql {
  const owner = scope.kind === 'user'
    ? Prisma.sql`u."userId" = ${scope.userId} AND u."workspaceId" IS NULL`
    : Prisma.sql`u."workspaceId" = ${scope.workspaceId}`
  return scope.tag ? Prisma.sql`${owner} AND u."tags" @> ARRAY[${scope.tag}]::text[]` : owner
}

type SeriesRow = { dateKey: string; clicks: bigint | number | null; conversions: bigint | number | null; valueCents: bigint | number | null }
type LinkRow = { id: string; shortCode: string; title: string | null; originalUrl: string; clicks: bigint | number; conversions: bigint | number; valueCents: bigint | number }
type TagRow = { tag: string; links: bigint | number; clicks: bigint | number }
type BreakdownRow = { key: string | null; clicks: bigint | number }

const n = (value: bigint | number | null | undefined) => Number(value ?? 0)

export async function getAggregatedAnalytics(scope: AnalyticsScope, window: AnalyticsWindow) {
  const where = scopeFilter(scope)
  const previous = previousWindow(window)
  const breakdownFrom = new Date(Math.max(
    new Date(`${window.from}T00:00:00Z`).getTime(),
    new Date(`${window.to}T00:00:00Z`).getTime() - (MAX_BREAKDOWN_DAYS - 1) * DAY_MS,
  ))
  const breakdownTo = new Date(new Date(`${window.to}T00:00:00Z`).getTime() + DAY_MS)

  const breakdown = (column: Prisma.Sql) => prisma.$queryRaw<BreakdownRow[]>(Prisma.sql`
    SELECT ${column} AS "key", COUNT(*)::bigint AS "clicks"
    FROM "click_events" c JOIN "urls" u ON u."id" = c."urlId"
    WHERE ${where} AND c."createdAt" >= ${breakdownFrom} AND c."createdAt" < ${breakdownTo} AND c."trafficType" = 'human'
    GROUP BY 1 ORDER BY 2 DESC LIMIT 10
  `)

  const windowStart = new Date(`${window.from}T00:00:00Z`)
  const windowEnd = new Date(new Date(`${window.to}T00:00:00Z`).getTime() + DAY_MS)

  const [series, previousTotals, linkCount, topLinks, tags, countries, devices, referrers, currencies] = await Promise.all([
    prisma.$queryRaw<SeriesRow[]>(Prisma.sql`
      WITH clicks AS (
        SELECT d."dateKey", SUM(d."clicks")::bigint AS "clicks"
        FROM "click_daily" d JOIN "urls" u ON u."id" = d."urlId"
        WHERE ${where} AND d."dateKey" BETWEEN ${window.from} AND ${window.to}
        GROUP BY d."dateKey"
      ), conversions AS (
        SELECT cd."dateKey", SUM(cd."conversions")::bigint AS "conversions", SUM(cd."valueCents")::bigint AS "valueCents"
        FROM "conversion_daily" cd JOIN "goals" g ON g."id" = cd."goalId" JOIN "urls" u ON u."id" = g."urlId"
        WHERE ${where} AND cd."dateKey" BETWEEN ${window.from} AND ${window.to}
        GROUP BY cd."dateKey"
      )
      SELECT COALESCE(k."dateKey", v."dateKey") AS "dateKey", k."clicks", v."conversions", v."valueCents"
      FROM clicks k FULL OUTER JOIN conversions v ON v."dateKey" = k."dateKey"
    `),
    prisma.$queryRaw<Array<{ clicks: bigint | null; conversions: bigint | null; valueCents: bigint | null }>>(Prisma.sql`
      SELECT
        (SELECT SUM(d."clicks") FROM "click_daily" d JOIN "urls" u ON u."id" = d."urlId"
          WHERE ${where} AND d."dateKey" BETWEEN ${previous.from} AND ${previous.to})::bigint AS "clicks",
        (SELECT SUM(cd."conversions") FROM "conversion_daily" cd JOIN "goals" g ON g."id" = cd."goalId" JOIN "urls" u ON u."id" = g."urlId"
          WHERE ${where} AND cd."dateKey" BETWEEN ${previous.from} AND ${previous.to})::bigint AS "conversions",
        (SELECT SUM(cd."valueCents") FROM "conversion_daily" cd JOIN "goals" g ON g."id" = cd."goalId" JOIN "urls" u ON u."id" = g."urlId"
          WHERE ${where} AND cd."dateKey" BETWEEN ${previous.from} AND ${previous.to})::bigint AS "valueCents"
    `),
    prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`SELECT COUNT(*)::bigint AS "count" FROM "urls" u WHERE ${where}`),
    prisma.$queryRaw<LinkRow[]>(Prisma.sql`
      WITH link_clicks AS (
        SELECT d."urlId", SUM(d."clicks")::bigint AS "clicks"
        FROM "click_daily" d JOIN "urls" u ON u."id" = d."urlId"
        WHERE ${where} AND d."dateKey" BETWEEN ${window.from} AND ${window.to}
        GROUP BY d."urlId" ORDER BY 2 DESC LIMIT 10
      )
      SELECT u."id", u."shortCode", u."title", u."originalUrl", lc."clicks",
        COALESCE(SUM(cd."conversions"), 0)::bigint AS "conversions",
        COALESCE(SUM(cd."valueCents"), 0)::bigint AS "valueCents"
      FROM link_clicks lc
      JOIN "urls" u ON u."id" = lc."urlId"
      LEFT JOIN "goals" g ON g."urlId" = u."id"
      LEFT JOIN "conversion_daily" cd ON cd."goalId" = g."id" AND cd."dateKey" BETWEEN ${window.from} AND ${window.to}
      GROUP BY u."id", lc."clicks"
      ORDER BY lc."clicks" DESC
    `),
    scope.tag
      ? Promise.resolve([] as TagRow[])
      : prisma.$queryRaw<TagRow[]>(Prisma.sql`
        SELECT t."tag", COUNT(DISTINCT u."id")::bigint AS "links", COALESCE(SUM(d."clicks"), 0)::bigint AS "clicks"
        FROM "urls" u
        CROSS JOIN LATERAL unnest(u."tags") AS t("tag")
        LEFT JOIN "click_daily" d ON d."urlId" = u."id" AND d."dateKey" BETWEEN ${window.from} AND ${window.to}
        WHERE ${where}
        GROUP BY t."tag" ORDER BY 3 DESC, 1 ASC LIMIT 20
      `),
    breakdown(Prisma.sql`c."country"`),
    breakdown(Prisma.sql`c."deviceType"::text`),
    breakdown(Prisma.sql`c."referrerHost"`),
    // The daily rollups carry no currency; split revenue by currency from the
    // (low-volume) conversion events so mixed-currency sales aren't summed blindly.
    prisma.$queryRaw<Array<{ currency: string | null; valueCents: bigint | number }>>(Prisma.sql`
      SELECT ce."currency", SUM(ce."valueCents")::bigint AS "valueCents"
      FROM "conversion_events" ce JOIN "urls" u ON u."id" = ce."urlId"
      WHERE ${where} AND ce."createdAt" >= ${windowStart} AND ce."createdAt" < ${windowEnd} AND ce."valueCents" IS NOT NULL
      GROUP BY 1 ORDER BY 2 DESC
    `),
  ])

  const byDate = new Map(series.map((row) => [row.dateKey, row]))
  const timeseries = dateKeys(window).map((date) => {
    const row = byDate.get(date)
    return { date, clicks: n(row?.clicks), conversions: n(row?.conversions), revenueCents: n(row?.valueCents) }
  })
  const totals = timeseries.reduce(
    (acc, day) => ({ clicks: acc.clicks + day.clicks, conversions: acc.conversions + day.conversions, revenueCents: acc.revenueCents + day.revenueCents }),
    { clicks: 0, conversions: 0, revenueCents: 0 },
  )
  const prev = previousTotals[0] ?? { clicks: 0n, conversions: 0n, valueCents: 0n }
  const prevTotals = { clicks: n(prev.clicks), conversions: n(prev.conversions), revenueCents: n(prev.valueCents) }
  const toBreakdown = (rows: BreakdownRow[]) => rows.map((row) => ({ key: row.key ?? 'unknown', clicks: n(row.clicks) }))

  return {
    window,
    links: n(linkCount[0]?.count),
    totals: {
      ...totals,
      conversionRate: totals.clicks ? Math.round((totals.conversions / totals.clicks) * 10_000) / 100 : 0,
    },
    previous: { window: previous, ...prevTotals },
    change: {
      clicks: percentChange(totals.clicks, prevTotals.clicks),
      conversions: percentChange(totals.conversions, prevTotals.conversions),
      revenueCents: percentChange(totals.revenueCents, prevTotals.revenueCents),
    },
    revenueByCurrency: currencies.map((row) => ({ currency: row.currency ?? 'UNKNOWN', valueCents: n(row.valueCents) })),
    timeseries,
    topLinks: topLinks.map((link) => ({
      id: link.id,
      shortCode: link.shortCode,
      title: link.title,
      originalUrl: link.originalUrl,
      clicks: n(link.clicks),
      conversions: n(link.conversions),
      revenueCents: n(link.valueCents),
    })),
    tags: tags.map((row) => ({ tag: row.tag, links: n(row.links), clicks: n(row.clicks) })),
    breakdowns: {
      window: { from: toKey(breakdownFrom), to: window.to },
      humanOnly: true,
      countries: toBreakdown(countries),
      devices: toBreakdown(devices),
      referrers: toBreakdown(referrers),
    },
  }
}
