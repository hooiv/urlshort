import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter, type AnalyticsScope } from './aggregate-analytics'

/**
 * Untagged links: active links with no tags, most-clicked first, so owners
 * can organise the ones that matter most (feeds bulk edit).
 */
export const UNTAGGED_MAX = 200
export const UNTAGGED_DEFAULT = 50

export type UntaggedLink = { id: string; shortCode: string; title: string | null; originalUrl: string; clicks: number; createdAt: string }

export function parseUntaggedLimit(raw: string | null): number | null {
  if (raw === null || raw === '') return UNTAGGED_DEFAULT
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return n >= 1 && n <= UNTAGGED_MAX ? n : null
}

/** Share of active links lacking tags, as an integer percent (0 when there are none). */
export function untaggedShare(untagged: number, total: number): number {
  return total > 0 ? Math.round((untagged / total) * 100) : 0
}

type Row = { id: string; shortCode: string; title: string | null; originalUrl: string; clicks: number; createdAt: Date }

export async function findUntaggedLinks(scope: AnalyticsScope, limit: number) {
  const where = Prisma.sql`${scopeFilter(scope)} AND u."isActive" = true`
  const [rows, counts] = await Promise.all([
    prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT u."id", u."shortCode", u."title", u."originalUrl", u."clicks", u."createdAt"
      FROM "urls" u
      WHERE ${where} AND cardinality(u."tags") = 0
      ORDER BY u."clicks" DESC, u."createdAt" ASC, u."shortCode" ASC
      LIMIT ${limit}`),
    prisma.$queryRaw<{ total: bigint; untagged: bigint }[]>(Prisma.sql`
      SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE cardinality(u."tags") = 0) AS untagged
      FROM "urls" u WHERE ${where}`),
  ])
  const total = Number(counts[0]?.total ?? 0)
  const untagged = Number(counts[0]?.untagged ?? 0)
  const links: UntaggedLink[] = rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))
  return { links, total, untagged, sharePercent: untaggedShare(untagged, total) }
}
