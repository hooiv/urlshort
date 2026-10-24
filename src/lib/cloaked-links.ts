import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter, type AnalyticsScope } from './aggregate-analytics'

/**
 * Links served through URL cloaking (destination shown in a frame, address bar
 * keeps the short URL). Cloaking breaks sites that send X-Frame-Options, so
 * owners need a list to audit it.
 */
export const CLOAKED_MAX = 200
export const CLOAKED_DEFAULT = 50

export function parseCloakedLimit(raw: string | null): number | null {
  if (raw === null || raw === '') return CLOAKED_DEFAULT
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return n >= 1 && n <= CLOAKED_MAX ? n : null
}

type Row = { id: string; shortCode: string; title: string | null; originalUrl: string; clicks: number }

export async function findCloakedLinks(scope: AnalyticsScope, limit: number) {
  const where = Prisma.sql`${scopeFilter(scope)} AND u."cloaked" = true`
  const [rows, counts] = await Promise.all([
    prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT u."id", u."shortCode", u."title", u."originalUrl", u."clicks"
      FROM "urls" u WHERE ${where}
      ORDER BY u."clicks" DESC, u."shortCode" ASC LIMIT ${limit}`),
    prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`SELECT COUNT(*) AS n FROM "urls" u WHERE ${where}`),
  ])
  return {
    links: rows.map((r) => ({ id: r.id, shortCode: r.shortCode, title: r.title, originalUrl: r.originalUrl, clicks: Number(r.clicks) })),
    total: Number(counts[0]?.n ?? 0),
  }
}
