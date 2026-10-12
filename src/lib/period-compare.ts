import { Prisma } from '@prisma/client'
import { prisma } from './prisma'

/**
 * Period-over-period comparison for one link: human clicks in the last N days vs
 * the N days before that, with a day-aligned series so charts can overlay them.
 * One grouped query over the (urlId, createdAt) index covers both windows.
 */

export const COMPARE_MAX_DAYS = 180
export const COMPARE_DEFAULT_DAYS = 30
const DAY_MS = 86_400_000

export type ComparePoint = { day: number; current: number; previous: number }
export type PeriodComparison = {
  days: number
  current: { from: string; to: string; clicks: number }
  previous: { from: string; to: string; clicks: number }
  /** Percent change vs previous; null when previous is 0 (undefined growth). */
  changePercent: number | null
  series: ComparePoint[]
}

export function parseCompareDays(raw: string | null): number | null {
  if (raw === null || raw === '') return COMPARE_DEFAULT_DAYS
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return n >= 1 && n <= COMPARE_MAX_DAYS ? n : null
}

/** UTC day index of an instant relative to the window start. */
export function buildComparison(
  rows: Array<{ offset: number; clicks: number }>, days: number, now: Date,
): PeriodComparison {
  const currentFrom = new Date(now.getTime() - days * DAY_MS)
  const previousFrom = new Date(now.getTime() - 2 * days * DAY_MS)
  const series: ComparePoint[] = Array.from({ length: days }, (_, i) => ({ day: i + 1, current: 0, previous: 0 }))
  let current = 0
  let previous = 0
  for (const { offset, clicks } of rows) {
    if (!Number.isFinite(clicks) || clicks <= 0 || offset < 0 || offset >= 2 * days) continue
    if (offset >= days) { current += clicks; series[offset - days].current += clicks }
    else { previous += clicks; series[offset].previous += clicks }
  }
  return {
    days,
    current: { from: currentFrom.toISOString(), to: now.toISOString(), clicks: current },
    previous: { from: previousFrom.toISOString(), to: currentFrom.toISOString(), clicks: previous },
    changePercent: previous === 0 ? null : Math.round(((current - previous) / previous) * 1000) / 10,
    series,
  }
}

export async function getPeriodComparison(urlId: string, days: number, now = new Date()): Promise<PeriodComparison> {
  const start = new Date(now.getTime() - 2 * days * DAY_MS)
  // Bucket by whole days since `start` so both windows align on the same boundaries as the series.
  const rows = await prisma.$queryRaw<Array<{ offset: number; clicks: bigint }>>(Prisma.sql`
    SELECT FLOOR(EXTRACT(EPOCH FROM ("createdAt" - ${start})) / 86400)::int AS "offset", COUNT(*) AS clicks
    FROM "click_events"
    WHERE "urlId" = ${urlId} AND "createdAt" >= ${start} AND "createdAt" < ${now} AND "trafficType" = 'human'
    GROUP BY 1`)
  return buildComparison(rows.map((r) => ({ offset: Number(r.offset), clicks: Number(r.clicks) })), days, now)
}
