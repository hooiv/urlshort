import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter } from './aggregate-analytics'

/**
 * Technology performance: human clicks and unique visitors per browser, operating system or device
 * type in a workspace over a window versus the window of equal length before it. Clicks without the
 * value are reported as "Unknown" (value null).
 */
export const TECH_DIMENSIONS = ['browser', 'os', 'device'] as const
export type TechDimension = (typeof TECH_DIMENSIONS)[number]
export const TECH_WINDOW_OPTIONS = [7, 30, 90] as const
export const TECH_DEFAULT_WINDOW = 30
export const TECH_MAX_ROWS = 100
const DAY_MS = 86_400_000

// Column names are fixed literals chosen from this map, never user input.
const COLUMN: Record<TechDimension, string> = { browser: 'browser', os: 'os', device: 'deviceType' }

export function parseTechDimension(raw: string | null): TechDimension | null {
  if (raw === null || raw === '') return 'browser'
  return (TECH_DIMENSIONS as readonly string[]).includes(raw) ? (raw as TechDimension) : null
}

export function parseTechWindow(raw: string | null): number | null {
  if (raw === null || raw === '') return TECH_DEFAULT_WINDOW
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return (TECH_WINDOW_OPTIONS as readonly number[]).includes(n) ? n : null
}

export type TechStat = {
  value: string | null
  name: string
  clicks: number
  visitors: number
  previousClicks: number
  changePct: number | null
  sharePct: number
}

type RawRow = { value: string | null; clicks: bigint | number; visitors: bigint | number; previous: bigint | number }

export function shapeTechStats(rows: RawRow[]): TechStat[] {
  const total = rows.reduce((s, r) => s + Number(r.clicks), 0)
  return rows
    .map((r) => {
      const value = r.value && r.value.trim() ? r.value.trim() : null
      const clicks = Number(r.clicks)
      const previousClicks = Number(r.previous)
      return {
        value,
        name: value ?? 'Unknown',
        clicks,
        visitors: Math.min(Number(r.visitors), clicks),
        previousClicks,
        changePct: previousClicks > 0 ? Math.round(((clicks - previousClicks) / previousClicks) * 1000) / 10 : null,
        sharePct: total > 0 ? Math.round((clicks / total) * 1000) / 10 : 0,
      }
    })
    .filter((r) => r.clicks > 0 || r.previousClicks > 0)
    .sort((a, b) => b.clicks - a.clicks || a.name.localeCompare(b.name))
}

export async function getTechPerformance(
  workspaceId: string,
  viewer: { userId: string } | undefined,
  dimension: TechDimension,
  days: number,
  now = new Date(),
) {
  const end = now
  const start = new Date(end.getTime() - days * DAY_MS)
  const prevStart = new Date(start.getTime() - days * DAY_MS)
  const col = Prisma.raw(`c."${COLUMN[dimension]}"::text`)
  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT ${col} AS "value",
      COUNT(*) FILTER (WHERE c."createdAt" >= ${start}) AS "clicks",
      COUNT(DISTINCT c."visitorIdHash") FILTER (WHERE c."createdAt" >= ${start}) AS "visitors",
      COUNT(*) FILTER (WHERE c."createdAt" < ${start}) AS "previous"
    FROM "click_events" c
    JOIN "urls" u ON u."id" = c."urlId"
    WHERE c."trafficType" = 'human' AND c."createdAt" >= ${prevStart} AND c."createdAt" < ${end}
      AND ${scopeFilter({ kind: 'workspace', workspaceId, viewer })}
    GROUP BY 1
    ORDER BY "clicks" DESC
    LIMIT ${TECH_MAX_ROWS}`)
  return { dimension, days, from: start.toISOString(), to: end.toISOString(), rows: shapeTechStats(rows) }
}
