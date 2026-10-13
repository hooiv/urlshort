import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter } from './aggregate-analytics'

/**
 * Tech performance: human clicks and unique visitors per device type, browser or operating
 * system in a workspace over a window versus the window of equal length before it. Clicks with
 * no value are reported as "Unknown". Viewers only see links they may access.
 */
export const TECH_DIMENSIONS = ['device', 'browser', 'os'] as const
export type TechDimension = (typeof TECH_DIMENSIONS)[number]
export const TECH_WINDOW_OPTIONS = [7, 30, 90] as const
export const TECH_DEFAULT_WINDOW = 30
export const TECH_MAX_ROWS = 100
const DAY_MS = 86_400_000

// Fixed fragments only: the dimension is validated against TECH_DIMENSIONS and never interpolated raw.
const COLUMN: Record<TechDimension, Prisma.Sql> = {
  device: Prisma.sql`c."deviceType"::text`,
  browser: Prisma.sql`c."browser"`,
  os: Prisma.sql`c."os"`,
}

export function parseTechDimension(raw: string | null): TechDimension | null {
  if (raw === null || raw === '') return 'device'
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
  label: string
  clicks: number
  visitors: number
  previousClicks: number
  changePct: number | null
  sharePct: number
}

type RawRow = { value: string | null; clicks: bigint | number; visitors: bigint | number; previous: bigint | number }

export function shapeTechStats(rows: RawRow[]): TechStat[] {
  // Merge values that differ only by case/whitespace; blanks become Unknown.
  const merged = new Map<string, { value: string | null; clicks: number; visitors: number; previousClicks: number }>()
  for (const r of rows) {
    const v = r.value?.trim() ? r.value.trim() : null
    const key = v ? v.toLowerCase() : '\u0000unknown'
    const cur = merged.get(key) ?? { value: v, clicks: 0, visitors: 0, previousClicks: 0 }
    cur.clicks += Number(r.clicks)
    cur.visitors += Number(r.visitors)
    cur.previousClicks += Number(r.previous)
    merged.set(key, cur)
  }
  const parsed = [...merged.values()]
  const total = parsed.reduce((s, r) => s + r.clicks, 0)
  return parsed
    .map((r) => ({
      ...r,
      label: r.value ? r.value.charAt(0).toUpperCase() + r.value.slice(1) : 'Unknown',
      changePct: r.previousClicks > 0 ? Math.round(((r.clicks - r.previousClicks) / r.previousClicks) * 1000) / 10 : null,
      sharePct: total > 0 ? Math.round((r.clicks / total) * 1000) / 10 : 0,
    }))
    .filter((r) => r.clicks > 0 || r.previousClicks > 0)
    .sort((a, b) => b.clicks - a.clicks || a.label.localeCompare(b.label))
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
  const col = COLUMN[dimension]
  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT ${col} AS "value",
      COUNT(*) FILTER (WHERE c."createdAt" >= ${start}) AS "clicks",
      COUNT(DISTINCT c."visitorIdHash") FILTER (WHERE c."createdAt" >= ${start}) AS "visitors",
      COUNT(*) FILTER (WHERE c."createdAt" < ${start}) AS "previous"
    FROM "click_events" c
    JOIN "urls" u ON u."id" = c."urlId"
    WHERE c."trafficType" = 'human' AND c."createdAt" >= ${prevStart} AND c."createdAt" < ${end}
      AND ${scopeFilter({ kind: 'workspace', workspaceId, viewer })}
    GROUP BY ${col}
    ORDER BY "clicks" DESC
    LIMIT ${TECH_MAX_ROWS}`)
  return { dimension, days, from: start.toISOString(), to: end.toISOString(), rows: shapeTechStats(rows) }
}
