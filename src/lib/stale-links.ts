import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter, type AnalyticsScope } from './aggregate-analytics'

/**
 * Stale links: active links that have received no human click for N days
 * (or never), and are older than N days so brand-new links are not flagged.
 * Cleanup candidates; archive them via /api/bulk/edit.
 */
export const STALE_DAYS_OPTIONS = [30, 60, 90, 180, 365] as const
export const STALE_DEFAULT_DAYS = 90
export const STALE_MAX_LIMIT = 200
export const STALE_DEFAULT_LIMIT = 50
const DAY_MS = 86_400_000

export function parseStaleDays(raw: string | null): number | null {
  if (raw === null || raw === '') return STALE_DEFAULT_DAYS
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return (STALE_DAYS_OPTIONS as readonly number[]).includes(n) ? n : null
}

export function parseStaleLimit(raw: string | null): number | null {
  if (raw === null || raw === '') return STALE_DEFAULT_LIMIT
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return n >= 1 && n <= STALE_MAX_LIMIT ? n : null
}

export type StaleLink = {
  id: string
  shortCode: string
  title: string | null
  originalUrl: string
  createdAt: string
  totalClicks: number
  lastClickAt: string | null
  idleDays: number
}

type RawRow = { id: string; shortCode: string; title: string | null; originalUrl: string; createdAt: Date; clicks: number; lastClick: Date | null; total: bigint | number }

/** Pure: shape raw rows; idle time counts from the last click, else from creation. */
export function shapeStale(rows: RawRow[], now: Date): StaleLink[] {
  return rows.map((r) => {
    const since = r.lastClick ?? r.createdAt
    return {
      id: r.id, shortCode: r.shortCode, title: r.title, originalUrl: r.originalUrl,
      createdAt: r.createdAt.toISOString(),
      totalClicks: Math.max(Number(r.total), r.clicks),
      lastClickAt: r.lastClick ? r.lastClick.toISOString() : null,
      idleDays: Math.max(0, Math.floor((now.getTime() - since.getTime()) / DAY_MS)),
    }
  })
}

export async function getStaleLinks(scope: AnalyticsScope, opts: { days: number; limit: number }, now = new Date()) {
  const cutoff = new Date(now.getTime() - opts.days * DAY_MS)
  const base = Prisma.sql`${scopeFilter(scope)} AND u."isActive" = true AND u."createdAt" < ${cutoff}`
  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT u."id", u."shortCode", u."title", u."originalUrl", u."createdAt", u."clicks",
      MAX(c."createdAt") AS "lastClick", COUNT(c."id") AS "total"
    FROM "urls" u
    LEFT JOIN "click_events" c ON c."urlId" = u."id" AND c."trafficType" = 'human'
    WHERE ${base}
    GROUP BY u."id"
    HAVING MAX(c."createdAt") IS NULL OR MAX(c."createdAt") < ${cutoff}
    ORDER BY COALESCE(MAX(c."createdAt"), u."createdAt") ASC, u."shortCode" ASC
    LIMIT ${opts.limit + 1}`)
  const truncated = rows.length > opts.limit
  return { days: opts.days, truncated, links: shapeStale(rows.slice(0, opts.limit), now) }
}
