import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter, type AnalyticsScope } from './aggregate-analytics'

/**
 * Links with a per-link visitor blocklist (IP/CIDR ranges, referrer hosts).
 * Owners audit which links silently deny traffic.
 */
export const BLOCKLISTED_MAX = 200
export const BLOCKLISTED_DEFAULT = 50

export function parseBlocklistedLimit(raw: string | null): number | null {
  if (raw === null || raw === '') return BLOCKLISTED_DEFAULT
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return n >= 1 && n <= BLOCKLISTED_MAX ? n : null
}

type Row = { id: string; shortCode: string; title: string | null; originalUrl: string; clicks: number; visitorBlock: unknown }

export async function findBlocklistedLinks(scope: AnalyticsScope, limit: number) {
  const where = Prisma.sql`${scopeFilter(scope)} AND u."visitorBlock" IS NOT NULL`
  const [rows, counts] = await Promise.all([
    prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT u."id", u."shortCode", u."title", u."originalUrl", u."clicks", u."visitorBlock"
      FROM "urls" u WHERE ${where}
      ORDER BY u."clicks" DESC, u."shortCode" ASC LIMIT ${limit}`),
    prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`SELECT COUNT(*) AS n FROM "urls" u WHERE ${where}`),
  ])
  return {
    links: rows.map((r) => ({ id: r.id, shortCode: r.shortCode, title: r.title, originalUrl: r.originalUrl, clicks: Number(r.clicks), cidrs: ((r.visitorBlock as {cidrs?:string[]} | null)?.cidrs ?? []).length, referrerHosts: ((r.visitorBlock as {referrerHosts?:string[]} | null)?.referrerHosts ?? []).length })),
    total: Number(counts[0]?.n ?? 0),
  }
}
