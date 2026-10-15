import { Prisma } from '@prisma/client'
import { prisma } from './prisma'

export const FORECAST_WINDOW_DAYS = 14
export const FORECAST_MAX_TARGET = 1_000_000_000

export type ForecastResult = {
  windowDays: number
  totalInWindow: number
  dailyAverage: number
  /** Least-squares slope in clicks/day² over the window; positive means accelerating. */
  trend: number
  currentTotal: number
  target: number | null
  /** Days from today until target is reached at the recent pace; null when unreachable or no target. */
  daysToTarget: number | null
  projectedDate: string | null
  projectedNext7Days: number
}

export function parseTarget(raw: string | null): number | null | undefined {
  if (raw === null || raw === '') return undefined
  if (!/^\d{1,10}$/.test(raw)) return null
  const n = Number(raw)
  return n >= 1 && n <= FORECAST_MAX_TARGET ? n : null
}

/** Pure projection from a dense oldest-first daily series (last element = today, partial days excluded by caller). */
export function projectClicks(daily: number[], currentTotal: number, target: number | undefined, today: Date): ForecastResult {
  const n = daily.length
  const total = daily.reduce((a, b) => a + b, 0)
  const avg = n ? total / n : 0
  let slope = 0
  if (n > 1) {
    const xm = (n - 1) / 2
    let num = 0
    let den = 0
    for (let i = 0; i < n; i++) { num += (i - xm) * (daily[i] - avg); den += (i - xm) ** 2 }
    slope = den ? num / den : 0
  }
  // Blend: damp the trend so a single spike cannot dominate the forecast.
  const pace = Math.max(0, avg + slope * ((n - 1) / 2) * 0.5)
  const next7 = Math.round(pace * 7)
  let days: number | null = null
  let date: string | null = null
  if (target !== undefined) {
    if (currentTotal >= target) { days = 0; date = today.toISOString().slice(0, 10) }
    else if (pace > 0) {
      days = Math.ceil((target - currentTotal) / pace)
      const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + days))
      date = d.toISOString().slice(0, 10)
    }
  }
  return {
    windowDays: n, totalInWindow: total, dailyAverage: Math.round(avg * 100) / 100, trend: Math.round(slope * 1000) / 1000,
    currentTotal, target: target ?? null, daysToTarget: days, projectedDate: date, projectedNext7Days: next7,
  }
}

export async function getClickForecast(urlId: string, target: number | undefined, now = new Date()): Promise<ForecastResult> {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const start = new Date(end.getTime() - FORECAST_WINDOW_DAYS * 86_400_000)
  const [rows, total] = await Promise.all([
    prisma.$queryRaw<Array<{ day: Date; clicks: bigint }>>(Prisma.sql`
      SELECT date_trunc('day', "createdAt" AT TIME ZONE 'UTC') AS day, COUNT(*)::bigint AS clicks
      FROM "click_events"
      WHERE "urlId" = ${urlId} AND "createdAt" >= ${start} AND "createdAt" < ${end} AND "trafficType" = 'human'
      GROUP BY 1`),
    prisma.clickEvent.count({ where: { urlId, trafficType: 'human' } }),
  ])
  const byDay = new Map(rows.map(r => [new Date(r.day).toISOString().slice(0, 10), Number(r.clicks)]))
  const daily: number[] = []
  for (let i = 0; i < FORECAST_WINDOW_DAYS; i++) {
    daily.push(byDay.get(new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10)) ?? 0)
  }
  return projectClicks(daily, total, target, end)
}
