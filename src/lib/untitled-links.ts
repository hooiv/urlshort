import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter, type AnalyticsScope } from './aggregate-analytics'

/**
 * Untitled links: active links with no title, most-clicked first, so owners
 * can name the ones that matter most (titles make link lists and previews readable).
 */
export const UNTITLED_MAX = 200
export const UNTITLED_DEFAULT = 50

export type UntitledLink = { id: string; shortCode: string; title: string | null; originalUrl: string; clicks: number; createdAt: string }

export function parseUntitledLimit(raw: string | null): number | null {
  if (raw === null || raw === '') return UNTITLED_DEFAULT
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return n >= 1 && n <= UNTITLED_MAX ? n : null
}

/** Share of active links lacking a title, as an integer percent (0 when there are none). */
export function untitledShare(untitled: number, total: number): number {
  return total > 0 ? Math.round((untitled / total) * 100) : 0
}

type Row = { id: string; shortCode: string; title: string | null; originalUrl: string; clicks: number; createdAt: Date }

export async function findUntitledLinks(scope: AnalyticsScope, limit: number) {
  const where = Prisma.sql`${scopeFilter(scope)} AND u."isActive" = true`
  const [rows, counts] = await Promise.all([
    prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT u."id", u."shortCode", u."title", u."originalUrl", u."clicks", u."createdAt"
      FROM "urls" u
      WHERE ${where} AND COALESCE(BTRIM(u."title"), '') = ''
      ORDER BY u."clicks" DESC, u."createdAt" ASC, u."shortCode" ASC
      LIMIT ${limit}`),
    prisma.$queryRaw<{ total: bigint; untitled: bigint }[]>(Prisma.sql`
      SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE COALESCE(BTRIM(u."title"), '') = '') AS untitled
      FROM "urls" u WHERE ${where}`),
  ])
  const total = Number(counts[0]?.total ?? 0)
  const untitled = Number(counts[0]?.untitled ?? 0)
  const links: UntitledLink[] = rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))
  return { links, total, untitled, sharePercent: untitledShare(untitled, total) }
}
