import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter, type AnalyticsScope } from './aggregate-analytics'

/**
 * Single-use (one-time) links: non-trashed links with maxClicks = 1.
 * Each is reported as `pending` (not yet opened) or `consumed`.
 */
export const SINGLE_USE_MAX = 200
export const SINGLE_USE_DEFAULT = 50
export type SingleUseStatus = 'pending' | 'consumed'
export type SingleUseFilter = SingleUseStatus | 'all'

export function parseSingleUseLimit(raw: string | null): number | null {
  if (raw === null || raw === '') return SINGLE_USE_DEFAULT
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return n >= 1 && n <= SINGLE_USE_MAX ? n : null
}

export function parseSingleUseStatus(raw: string | null): SingleUseFilter | null {
  if (raw === null || raw === '') return 'all'
  return raw === 'pending' || raw === 'consumed' || raw === 'all' ? raw : null
}

export function singleUseStatus(clicks: number): SingleUseStatus {
  return clicks >= 1 ? 'consumed' : 'pending'
}

type Row = { id: string; shortCode: string; title: string | null; originalUrl: string; clicks: number; createdAt: Date }

export async function findSingleUseLinks(scope: AnalyticsScope, limit: number, status: SingleUseFilter = 'all') {
  const statusSql = status === 'pending' ? Prisma.sql` AND u."clicks" < 1` : status === 'consumed' ? Prisma.sql` AND u."clicks" >= 1` : Prisma.empty
  const where = Prisma.sql`${scopeFilter(scope)} AND u."maxClicks" = 1${statusSql}`
  const [rows, counts] = await Promise.all([
    prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT u."id", u."shortCode", u."title", u."originalUrl", u."clicks", u."createdAt"
      FROM "urls" u WHERE ${where}
      ORDER BY u."createdAt" DESC, u."shortCode" ASC LIMIT ${limit}`),
    prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`SELECT COUNT(*) AS n FROM "urls" u WHERE ${where}`),
  ])
  const links = rows.map((r) => ({
    id: r.id, shortCode: r.shortCode, title: r.title, originalUrl: r.originalUrl,
    clicks: Number(r.clicks), status: singleUseStatus(Number(r.clicks)), createdAt: r.createdAt.toISOString(),
  }))
  return { links, total: Number(counts[0]?.n ?? 0) }
}
