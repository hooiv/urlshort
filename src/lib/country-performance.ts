import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter } from './aggregate-analytics'

/**
 * Country performance: human clicks and unique visitors per country in a workspace over a
 * window versus the window of the same length before it. Clicks with no resolved country are
 * reported as "Unknown" (country null). Viewers only see links they may access.
 */
export const COUNTRY_WINDOW_OPTIONS = [7, 30, 90] as const
export const COUNTRY_DEFAULT_WINDOW = 30
export const COUNTRY_MAX_ROWS = 250
const DAY_MS = 86_400_000

export function parseCountryWindow(raw: string | null): number | null {
  if (raw === null || raw === '') return COUNTRY_DEFAULT_WINDOW
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return (COUNTRY_WINDOW_OPTIONS as readonly number[]).includes(n) ? n : null
}

export type CountryStat = {
  country: string | null
  name: string
  clicks: number
  visitors: number
  previousClicks: number
  changePct: number | null
  sharePct: number
}

type RawRow = { country: string | null; clicks: bigint | number; visitors: bigint | number; previous: bigint | number }

export function countryName(code: string | null): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return 'Unknown'
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code.toUpperCase()) ?? code.toUpperCase()
  } catch {
    return code.toUpperCase()
  }
}

export function shapeCountryStats(rows: RawRow[]): CountryStat[] {
  // Merge rows whose codes normalise to the same country (case differences, junk values -> Unknown).
  const merged = new Map<string, { country: string | null; clicks: number; visitors: number; previousClicks: number }>()
  for (const r of rows) {
    const code = r.country && /^[A-Za-z]{2}$/.test(r.country) ? r.country.toUpperCase() : null
    const key = code ?? '\u0000unknown'
    const cur = merged.get(key) ?? { country: code, clicks: 0, visitors: 0, previousClicks: 0 }
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
      name: countryName(r.country),
      changePct: r.previousClicks > 0 ? Math.round(((r.clicks - r.previousClicks) / r.previousClicks) * 1000) / 10 : null,
      sharePct: total > 0 ? Math.round((r.clicks / total) * 1000) / 10 : 0,
    }))
    .filter((r) => r.clicks > 0 || r.previousClicks > 0)
    .sort((a, b) => b.clicks - a.clicks || a.name.localeCompare(b.name))
}

export async function getCountryPerformance(
  workspaceId: string,
  viewer: { userId: string } | undefined,
  days: number,
  now = new Date(),
) {
  const end = now
  const start = new Date(end.getTime() - days * DAY_MS)
  const prevStart = new Date(start.getTime() - days * DAY_MS)
  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT UPPER(c."country") AS "country",
      COUNT(*) FILTER (WHERE c."createdAt" >= ${start}) AS "clicks",
      COUNT(DISTINCT c."visitorIdHash") FILTER (WHERE c."createdAt" >= ${start}) AS "visitors",
      COUNT(*) FILTER (WHERE c."createdAt" < ${start}) AS "previous"
    FROM "click_events" c
    JOIN "urls" u ON u."id" = c."urlId"
    WHERE c."trafficType" = 'human' AND c."createdAt" >= ${prevStart} AND c."createdAt" < ${end}
      AND ${scopeFilter({ kind: 'workspace', workspaceId, viewer })}
    GROUP BY UPPER(c."country")
    ORDER BY "clicks" DESC
    LIMIT ${COUNTRY_MAX_ROWS}`)
  return { days, from: start.toISOString(), to: end.toISOString(), countries: shapeCountryStats(rows) }
}
