import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter, type AnalyticsScope } from './aggregate-analytics'

/**
 * Side-by-side comparison of up to 5 links: human clicks per UTC day with
 * zero-filled gaps, so the series line up and can be charted directly.
 */
export const COMPARE_MAX_LINKS = 5
export const COMPARE_DAYS_OPTIONS = [7, 14, 30, 90] as const
export const COMPARE_DEFAULT_DAYS = 30
const DAY_MS = 86_400_000

export function parseCompareCodes(raw: string | null): string[] | null {
  if (!raw) return null
  const codes = [...new Set(raw.split(',').map((c) => c.trim()).filter(Boolean))]
  if (codes.length < 2 || codes.length > COMPARE_MAX_LINKS) return null
  return codes.every((c) => /^[A-Za-z0-9_-]{1,64}$/.test(c)) ? codes : null
}

export function parseCompareDays(raw: string | null): number | null {
  if (raw === null || raw === '') return COMPARE_DEFAULT_DAYS
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return (COMPARE_DAYS_OPTIONS as readonly number[]).includes(n) ? n : null
}

export type CompareSeries = { shortCode: string; title: string | null; total: number; peakDay: string | null; daily: number[] }
export type CompareResult = { days: string[]; links: CompareSeries[]; missing: string[]; leader: string | null; leaderConfidence: number | null }

export function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function dayRange(days: number, now: Date): string[] {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (days - 1) * DAY_MS
  return Array.from({ length: days }, (_, i) => utcDayKey(new Date(start + i * DAY_MS)))
}

type RawRow = { shortCode: string; title: string | null; day: string; clicks: bigint | number }

/** Pure: zero-fill raw (link, day, clicks) rows into aligned series. */
export function buildCompare(codes: string[], found: { shortCode: string; title: string | null }[], rows: RawRow[], dayKeys: string[]): CompareResult {
  const index = new Map(dayKeys.map((d, i) => [d, i]))
  const byCode = new Map(found.map((l) => [l.shortCode, { shortCode: l.shortCode, title: l.title, total: 0, peakDay: null as string | null, daily: dayKeys.map(() => 0) }]))
  for (const r of rows) {
    const s = byCode.get(r.shortCode)
    const i = index.get(r.day)
    if (!s || i === undefined) continue
    s.daily[i] += Number(r.clicks)
  }
  const links = codes.filter((c) => byCode.has(c)).map((c) => {
    const s = byCode.get(c)!
    s.total = s.daily.reduce((a, b) => a + b, 0)
    const max = Math.max(...s.daily)
    s.peakDay = max > 0 ? dayKeys[s.daily.indexOf(max)] : null
    return s
  })
  const top = [...links].sort((a, b) => b.total - a.total)
  const leader = top.length > 0 && top[0].total > 0 && (top.length === 1 || top[0].total > top[1].total) ? top[0].shortCode : null
  const leaderConfidence = leader && top.length > 1 ? leadConfidence(top[0].total, top[1].total) : null
  return { days: dayKeys, links, missing: codes.filter((c) => !byCode.has(c)), leader, leaderConfidence }
}

/** Standard normal CDF (Abramowitz-Stegun 7.1.26 via erf). */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2)
  const x = Math.abs(z) / Math.SQRT2
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf)
}

/**
 * Probability (0..1) that the leader's true click rate really exceeds the runner-up's,
 * for equal exposure windows: conditional on a+b total clicks, a ~ Binomial(a+b, 0.5),
 * so z = (a-b)/sqrt(a+b) (normal approximation with continuity correction).
 */
export function leadConfidence(a: number, b: number): number | null {
  const n = a + b
  if (n < 10 || a <= b) return null
  const z = (a - b - 1) / Math.sqrt(n)
  return Math.round(normalCdf(Math.max(z, 0)) * 10000) / 10000
}

export async function compareLinks(scope: AnalyticsScope, codes: string[], days: number, now = new Date()): Promise<CompareResult> {
  const dayKeys = dayRange(days, now)
  const from = new Date(`${dayKeys[0]}T00:00:00.000Z`)
  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT u."shortCode", u."title", to_char(c."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "day", COUNT(*) AS "clicks"
    FROM "click_events" c
    JOIN "urls" u ON u."id" = c."urlId"
    WHERE ${scopeFilter(scope)}
      AND c."trafficType" = 'human'
      AND c."createdAt" >= ${from}
      AND u."shortCode" IN (${Prisma.join(codes)})
    GROUP BY 1, 2, 3`)
  const found = await prisma.$queryRaw<{ shortCode: string; title: string | null }[]>(Prisma.sql`
    SELECT u."shortCode", u."title" FROM "urls" u
    WHERE ${scopeFilter(scope)} AND u."shortCode" IN (${Prisma.join(codes)})`)
  return buildCompare(codes, found, rows, dayKeys)
}
