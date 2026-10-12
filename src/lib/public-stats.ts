import { createHash, randomBytes } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { dateKeys, percentChange, previousWindow, type AnalyticsWindow } from './aggregate-analytics'

/**
 * Public stats pages: an owner can publish a read-only dashboard for one link
 * (like Dub's public stats). The URL carries a random 256-bit token; only its
 * SHA-256 is stored, so a database leak cannot reveal live share links, and the
 * token is shown exactly once. Rotating issues a new token and kills the old.
 * The public payload is aggregate-only: no IPs, no raw referrer URLs, no
 * destination URL, and never anything for another link.
 */
export const PUBLIC_STATS_PREFIX = 'qls_'
const TOKEN_RE = /^qls_[A-Za-z0-9_-]{43}$/

export function generatePublicStatsToken(): string {
  return PUBLIC_STATS_PREFIX + randomBytes(32).toString('base64url')
}

export function hashPublicStatsToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function isPublicStatsToken(token: string): boolean {
  return TOKEN_RE.test(token)
}

/** Enable (or rotate) sharing. Returns the plaintext token once. */
export async function enablePublicStats(urlId: string): Promise<{ token: string; enabledAt: Date }> {
  const token = generatePublicStatsToken()
  const enabledAt = new Date()
  await prisma.url.update({ where: { id: urlId }, data: { publicStatsHash: hashPublicStatsToken(token), publicStatsEnabledAt: enabledAt } })
  return { token, enabledAt }
}

export async function disablePublicStats(urlId: string): Promise<void> {
  await prisma.url.update({ where: { id: urlId }, data: { publicStatsHash: null, publicStatsEnabledAt: null } })
}

type Row = { key: string | null; clicks: bigint | number }
const n = (v: bigint | number | null | undefined) => Number(v ?? 0)

export type PublicStats = {
  link: { shortCode: string; title: string | null; createdAt: string }
  window: AnalyticsWindow
  totals: { clicks: number; previousClicks: number; changePercent: number | null; allTimeClicks: number }
  series: Array<{ date: string; clicks: number }>
  countries: Array<{ key: string; clicks: number }>
  devices: Array<{ key: string; clicks: number }>
  referrers: Array<{ key: string; clicks: number }>
}

/** Resolves a token to its link and aggregates. Returns null for any unknown/revoked token. */
export async function getPublicStats(token: string, window: AnalyticsWindow): Promise<PublicStats | null> {
  if (!isPublicStatsToken(token)) return null
  const url = await prisma.url.findUnique({
    where: { publicStatsHash: hashPublicStatsToken(token) },
    select: { id: true, shortCode: true, title: true, createdAt: true, clicks: true },
  })
  if (!url) return null
  const prev = previousWindow(window)
  const breakdown = (dimension: string) => prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT "key", SUM("clicks")::bigint AS "clicks" FROM "click_dimension_daily"
    WHERE "urlId" = ${url.id} AND "dimension" = ${dimension} AND "dateKey" BETWEEN ${window.from} AND ${window.to}
    GROUP BY "key" ORDER BY 2 DESC, 1 ASC LIMIT 10`)
  const [series, previous, countries, devices, referrers] = await Promise.all([
    prisma.$queryRaw<Array<{ dateKey: string; clicks: bigint | number }>>(Prisma.sql`
      SELECT "dateKey", SUM("clicks")::bigint AS "clicks" FROM "click_daily"
      WHERE "urlId" = ${url.id} AND "dateKey" BETWEEN ${window.from} AND ${window.to} GROUP BY "dateKey"`),
    prisma.$queryRaw<Array<{ clicks: bigint | null }>>(Prisma.sql`
      SELECT SUM("clicks")::bigint AS "clicks" FROM "click_daily"
      WHERE "urlId" = ${url.id} AND "dateKey" BETWEEN ${prev.from} AND ${prev.to}`),
    breakdown('country'), breakdown('device'), breakdown('referrer'),
  ])
  const byDay = new Map(series.map((r) => [r.dateKey, n(r.clicks)]))
  const points = dateKeys(window).map((date) => ({ date, clicks: byDay.get(date) ?? 0 }))
  const clicks = points.reduce((sum, p) => sum + p.clicks, 0)
  const previousClicks = n(previous[0]?.clicks)
  const clean = (rows: Row[]) => rows.filter((r) => r.key).map((r) => ({ key: r.key as string, clicks: n(r.clicks) }))
  return {
    link: { shortCode: url.shortCode, title: url.title, createdAt: url.createdAt.toISOString() },
    window,
    totals: { clicks, previousClicks, changePercent: percentChange(clicks, previousClicks), allTimeClicks: url.clicks },
    series: points,
    countries: clean(countries), devices: clean(devices), referrers: clean(referrers),
  }
}
