import { Prisma } from '@prisma/client'
import { prisma } from './prisma'

/**
 * Best-time-to-post heatmap: human clicks for one link bucketed by weekday
 * (0 = Sunday … 6 = Saturday) and hour of day in the viewer's IANA timezone.
 * Bucketing happens in Postgres (AT TIME ZONE) so only 168 cells leave the DB,
 * and the window is capped so the scan stays on the (urlId, createdAt) index.
 */

export const HEATMAP_MAX_DAYS = 90
export const HEATMAP_DEFAULT_DAYS = 30
const DAY_MS = 86_400_000

export type HeatmapSlot = { day: number; hour: number; clicks: number }
export type ClickHeatmap = {
  timezone: string
  days: number
  /** 7 rows (Sun..Sat) × 24 columns of human click counts. */
  grid: number[][]
  total: number
  peak: HeatmapSlot | null
  /** Up to three highest-traffic slots, best first. Ties resolve to the earliest day/hour. */
  topSlots: HeatmapSlot[]
}

export function isValidTimezone(tz: string): boolean {
  if (!tz || tz.length > 64) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export function parseHeatmapDays(raw: string | null): number | null {
  if (raw === null || raw === '') return HEATMAP_DEFAULT_DAYS
  if (!/^\d{1,3}$/.test(raw)) return null
  const days = Number(raw)
  return days >= 1 && days <= HEATMAP_MAX_DAYS ? days : null
}

/** Pure: fold sparse (day, hour, clicks) rows into the dense grid and rank slots. */
export function buildHeatmap(rows: HeatmapSlot[], timezone: string, days: number): ClickHeatmap {
  const grid = Array.from({ length: 7 }, () => new Array<number>(24).fill(0))
  let total = 0
  for (const { day, hour, clicks } of rows) {
    if (!Number.isInteger(day) || !Number.isInteger(hour) || day < 0 || day > 6 || hour < 0 || hour > 23 || clicks <= 0) continue
    grid[day][hour] += clicks
    total += clicks
  }
  const slots: HeatmapSlot[] = []
  grid.forEach((row, day) => row.forEach((clicks, hour) => { if (clicks > 0) slots.push({ day, hour, clicks }) }))
  slots.sort((a, b) => b.clicks - a.clicks || a.day - b.day || a.hour - b.hour)
  return { timezone, days, grid, total, peak: slots[0] ?? null, topSlots: slots.slice(0, 3) }
}

export async function getClickHeatmap(urlId: string, timezone: string, days: number, now = new Date()): Promise<ClickHeatmap> {
  const since = new Date(now.getTime() - days * DAY_MS)
  const rows = await prisma.$queryRaw<Array<{ day: number; hour: number; clicks: bigint }>>(Prisma.sql`
    SELECT EXTRACT(DOW FROM ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})::int AS day,
           EXTRACT(HOUR FROM ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})::int AS hour,
           COUNT(*) AS clicks
    FROM "click_events"
    WHERE "urlId" = ${urlId} AND "createdAt" >= ${since} AND "createdAt" <= ${now} AND "trafficType" = 'human'
    GROUP BY 1, 2`)
  return buildHeatmap(rows.map((r) => ({ day: r.day, hour: r.hour, clicks: Number(r.clicks) })), timezone, days)
}
