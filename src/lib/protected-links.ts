import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter, type AnalyticsScope } from './aggregate-analytics'

/**
 * Password-protected links: active, non-trashed links that require a
 * password, most clicked first, so owners can audit what is gated.
 * The hash itself is never selected.
 */
export const PROTECTED_MAX = 200
export const PROTECTED_DEFAULT = 50

export type ProtectedLink = { id: string; shortCode: string; title: string | null; originalUrl: string; clicks: number; createdAt: string }

export function parseProtectedLimit(raw: string | null): number | null {
  if (raw === null || raw === '') return PROTECTED_DEFAULT
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return n >= 1 && n <= PROTECTED_MAX ? n : null
}

type Row = { id: string; shortCode: string; title: string | null; originalUrl: string; clicks: number; createdAt: Date }

export async function findProtectedLinks(scope: AnalyticsScope, limit: number) {
  const where = Prisma.sql`${scopeFilter(scope)} AND u."passwordHash" IS NOT NULL AND u."isActive" = true`
  const [rows, counts] = await Promise.all([
    prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT u."id", u."shortCode", u."title", u."originalUrl", u."clicks", u."createdAt"
      FROM "urls" u WHERE ${where}
      ORDER BY u."clicks" DESC, u."shortCode" ASC LIMIT ${limit}`),
    prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`SELECT COUNT(*) AS n FROM "urls" u WHERE ${where}`),
  ])
  const links: ProtectedLink[] = rows.map((r) => ({
    id: r.id, shortCode: r.shortCode, title: r.title, originalUrl: r.originalUrl, clicks: Number(r.clicks), createdAt: r.createdAt.toISOString(),
  }))
  return { links, total: Number(counts[0]?.n ?? 0) }
}
