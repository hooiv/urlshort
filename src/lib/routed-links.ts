import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter, type AnalyticsScope } from './aggregate-analytics'

/**
 * Links that use smart routing: non-trashed links with at least one LinkRule.
 * Reports total/enabled rule counts so owners can audit what routes where.
 */
export const ROUTED_MAX = 200
export const ROUTED_DEFAULT = 50

export function parseRoutedLimit(raw: string | null): number | null {
  if (raw === null || raw === '') return ROUTED_DEFAULT
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return n >= 1 && n <= ROUTED_MAX ? n : null
}

type Row = { id: string; shortCode: string; title: string | null; originalUrl: string; clicks: number; rules: bigint; enabledRules: bigint }

export async function findRoutedLinks(scope: AnalyticsScope, limit: number) {
  const where = Prisma.sql`${scopeFilter(scope)} AND EXISTS (SELECT 1 FROM "link_rules" r WHERE r."urlId" = u."id")`
  const [rows, counts] = await Promise.all([
    prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT u."id", u."shortCode", u."title", u."originalUrl", u."clicks",
        (SELECT COUNT(*) FROM "link_rules" r WHERE r."urlId" = u."id") AS rules,
        (SELECT COUNT(*) FROM "link_rules" r WHERE r."urlId" = u."id" AND r."enabled") AS "enabledRules"
      FROM "urls" u WHERE ${where}
      ORDER BY u."clicks" DESC, u."shortCode" ASC LIMIT ${limit}`),
    prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`SELECT COUNT(*) AS n FROM "urls" u WHERE ${where}`),
  ])
  return {
    links: rows.map((r) => ({
      id: r.id, shortCode: r.shortCode, title: r.title, originalUrl: r.originalUrl,
      clicks: Number(r.clicks), rules: Number(r.rules), enabledRules: Number(r.enabledRules),
    })),
    total: Number(counts[0]?.n ?? 0),
  }
}
