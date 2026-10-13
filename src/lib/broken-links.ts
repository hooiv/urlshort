import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter, type AnalyticsScope } from './aggregate-analytics'

/**
 * Broken links report: active links whose last destination health probe says
 * `down` or `degraded`, worst first (most consecutive failures, then most
 * traffic at risk). Fix the destination or archive via /api/bulk/edit.
 */
export const BROKEN_STATUSES = ['down', 'degraded'] as const
export type BrokenStatus = (typeof BROKEN_STATUSES)[number]
export const BROKEN_MAX_LIMIT = 200
export const BROKEN_DEFAULT_LIMIT = 50

export function parseBrokenStatus(raw: string | null): BrokenStatus[] | null {
  if (raw === null || raw === '' || raw === 'all') return [...BROKEN_STATUSES]
  return (BROKEN_STATUSES as readonly string[]).includes(raw) ? [raw as BrokenStatus] : null
}

export function parseBrokenLimit(raw: string | null): number | null {
  if (raw === null || raw === '') return BROKEN_DEFAULT_LIMIT
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return n >= 1 && n <= BROKEN_MAX_LIMIT ? n : null
}

export type BrokenLink = {
  id: string
  shortCode: string
  title: string | null
  originalUrl: string
  status: BrokenStatus
  statusCode: number | null
  lastError: string | null
  consecutiveFailures: number
  checkedAt: string | null
  clicksLast7d: number
}

type RawRow = {
  id: string; shortCode: string; title: string | null; originalUrl: string
  healthStatus: string; healthStatusCode: number | null; healthLastError: string | null
  healthConsecutiveFailures: number; healthCheckedAt: Date | null; recent: bigint | number
}

export function shapeBroken(rows: RawRow[]): BrokenLink[] {
  return rows.map((r) => ({
    id: r.id, shortCode: r.shortCode, title: r.title, originalUrl: r.originalUrl,
    status: r.healthStatus as BrokenStatus,
    statusCode: r.healthStatusCode,
    lastError: r.healthLastError ? r.healthLastError.slice(0, 200) : null,
    consecutiveFailures: r.healthConsecutiveFailures,
    checkedAt: r.healthCheckedAt ? r.healthCheckedAt.toISOString() : null,
    clicksLast7d: Number(r.recent),
  }))
}

export async function getBrokenLinks(scope: AnalyticsScope, opts: { statuses: BrokenStatus[]; limit: number }, now = new Date()) {
  const since = new Date(now.getTime() - 7 * 86_400_000)
  const statuses = Prisma.join(opts.statuses.map((s) => Prisma.sql`${s}::"HealthStatus"`))
  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT u."id", u."shortCode", u."title", u."originalUrl", u."healthStatus"::text AS "healthStatus",
      u."healthStatusCode", u."healthLastError", u."healthConsecutiveFailures", u."healthCheckedAt",
      (SELECT COUNT(*) FROM "click_events" c WHERE c."urlId" = u."id" AND c."trafficType" = 'human' AND c."createdAt" >= ${since}) AS "recent"
    FROM "urls" u
    WHERE ${scopeFilter(scope)} AND u."isActive" = true AND u."healthStatus" IN (${statuses})
    ORDER BY (u."healthStatus" = 'down') DESC, u."healthConsecutiveFailures" DESC, "recent" DESC, u."shortCode" ASC
    LIMIT ${opts.limit + 1}`)
  const truncated = rows.length > opts.limit
  return { truncated, links: shapeBroken(rows.slice(0, opts.limit)) }
}
