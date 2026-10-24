import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter, type AnalyticsScope } from './aggregate-analytics'

/**
 * Links with a custom social preview (description or og image set).
 * Owners audit which links show hand-written previews to crawlers.
 */
export const CUSTOM_OG_MAX = 200
export const CUSTOM_OG_DEFAULT = 50

export function parseCustomOgLimit(raw: string | null): number | null {
  if (raw === null || raw === '') return CUSTOM_OG_DEFAULT
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return n >= 1 && n <= CUSTOM_OG_MAX ? n : null
}

type Row = { id: string; shortCode: string; title: string | null; originalUrl: string; clicks: number; description: string | null; ogImage: string | null }

export async function findCustomOgLinks(scope: AnalyticsScope, limit: number) {
  const where = Prisma.sql`${scopeFilter(scope)} AND (u."ogImage" IS NOT NULL OR u."description" IS NOT NULL)`
  const [rows, counts] = await Promise.all([
    prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT u."id", u."shortCode", u."title", u."originalUrl", u."clicks", u."description", u."ogImage"
      FROM "urls" u WHERE ${where}
      ORDER BY u."clicks" DESC, u."shortCode" ASC LIMIT ${limit}`),
    prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`SELECT COUNT(*) AS n FROM "urls" u WHERE ${where}`),
  ])
  return {
    links: rows.map((r) => ({ id: r.id, shortCode: r.shortCode, title: r.title, originalUrl: r.originalUrl, clicks: Number(r.clicks), description: r.description, ogImage: r.ogImage})),
    total: Number(counts[0]?.n ?? 0),
  }
}
