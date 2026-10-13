import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter } from './aggregate-analytics'
import { countryName } from './country-performance'

/**
 * City performance: human clicks and unique visitors per city (with its country) in a workspace over a
 * window versus the equal window before. Clicks without a resolved city are left out (use the country
 * report for those). Same city name in different countries stays separate. Viewers only see links they may access.
 */
export const CITY_WINDOW_OPTIONS = [7, 30, 90] as const
export const CITY_DEFAULT_WINDOW = 30
export const CITY_MAX_ROWS = 250
const DAY_MS = 86_400_000

export function parseCityWindow(raw: string | null): number | null {
  if (raw === null || raw === '') return CITY_DEFAULT_WINDOW
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return (CITY_WINDOW_OPTIONS as readonly number[]).includes(n) ? n : null
}

export type CityStat = {
  city: string
  country: string | null
  countryName: string
  clicks: number
  visitors: number
  previousClicks: number
  changePct: number | null
  sharePct: number
}

type RawRow = { city: string | null; country: string | null; clicks: bigint | number; visitors: bigint | number; previous: bigint | number }

export function shapeCityStats(rows: RawRow[]): CityStat[] {
  const merged = new Map<string, Omit<CityStat, 'countryName' | 'changePct' | 'sharePct'>>()
  for (const r of rows) {
    const city = (r.city ?? '').trim().replace(/\s+/g, ' ')
    if (!city) continue
    const country = r.country && /^[A-Za-z]{2}$/.test(r.country) ? r.country.toUpperCase() : null
    const key = `${city.toLowerCase()}|${country ?? ''}`
    const cur = merged.get(key) ?? { city, country, clicks: 0, visitors: 0, previousClicks: 0 }
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
      countryName: countryName(r.country),
      changePct: r.previousClicks > 0 ? Math.round(((r.clicks - r.previousClicks) / r.previousClicks) * 1000) / 10 : null,
      sharePct: total > 0 ? Math.round((r.clicks / total) * 1000) / 10 : 0,
    }))
    .filter((r) => r.clicks > 0 || r.previousClicks > 0)
    .sort((a, b) => b.clicks - a.clicks || a.city.localeCompare(b.city))
}

export async function getCityPerformance(
  workspaceId: string,
  viewer: { userId: string } | undefined,
  days: number,
  now = new Date(),
) {
  const end = now
  const start = new Date(end.getTime() - days * DAY_MS)
  const prevStart = new Date(start.getTime() - days * DAY_MS)
  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT LOWER(BTRIM(c."city")) AS "cityKey", MIN(BTRIM(c."city")) AS "city", UPPER(c."country") AS "country",
      COUNT(*) FILTER (WHERE c."createdAt" >= ${start}) AS "clicks",
      COUNT(DISTINCT c."visitorIdHash") FILTER (WHERE c."createdAt" >= ${start}) AS "visitors",
      COUNT(*) FILTER (WHERE c."createdAt" < ${start}) AS "previous"
    FROM "click_events" c
    JOIN "urls" u ON u."id" = c."urlId"
    WHERE c."trafficType" = 'human' AND c."city" IS NOT NULL AND BTRIM(c."city") <> ''
      AND c."createdAt" >= ${prevStart} AND c."createdAt" < ${end}
      AND ${scopeFilter({ kind: 'workspace', workspaceId, viewer })}
    GROUP BY LOWER(BTRIM(c."city")), UPPER(c."country")
    ORDER BY "clicks" DESC
    LIMIT ${CITY_MAX_ROWS}`)
  return { days, from: start.toISOString(), to: end.toISOString(), cities: shapeCityStats(rows) }
}
