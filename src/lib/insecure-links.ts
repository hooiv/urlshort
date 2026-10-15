import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter, type AnalyticsScope } from './aggregate-analytics'

/**
 * Insecure destinations: active links whose destination is plain http://.
 * Browsers warn on these and they leak referrers, so owners want them fixed.
 */
export const INSECURE_MAX = 200
export const INSECURE_DEFAULT = 50

export type InsecureLink = { id: string; shortCode: string; title: string | null; originalUrl: string; httpsUrl: string; clicks: number; createdAt: string }

export function parseInsecureLimit(raw: string | null): number | null {
  if (raw === null || raw === '') return INSECURE_DEFAULT
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return n >= 1 && n <= INSECURE_MAX ? n : null
}

/** The https:// equivalent of a plain-http URL; null when the URL is not http. */
export function toHttpsUrl(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.protocol !== 'http:') return null
    u.protocol = 'https:'
    // URL keeps an explicit :80 as-is when switching scheme; drop it.
    if (u.port === '80') u.port = ''
    return u.toString()
  } catch {
    return null
  }
}

export function insecureShare(insecure: number, total: number): number {
  return total > 0 ? Math.round((insecure / total) * 100) : 0
}

type Row = { id: string; shortCode: string; title: string | null; originalUrl: string; clicks: number; createdAt: Date }

export async function findInsecureLinks(scope: AnalyticsScope, limit: number) {
  const where = Prisma.sql`${scopeFilter(scope)} AND u."isActive" = true`
  const [rows, counts] = await Promise.all([
    prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT u."id", u."shortCode", u."title", u."originalUrl", u."clicks", u."createdAt"
      FROM "urls" u
      WHERE ${where} AND lower(u."originalUrl") LIKE 'http://%'
      ORDER BY u."clicks" DESC, u."createdAt" ASC, u."shortCode" ASC
      LIMIT ${limit}`),
    prisma.$queryRaw<{ total: bigint; insecure: bigint }[]>(Prisma.sql`
      SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE lower(u."originalUrl") LIKE 'http://%') AS insecure
      FROM "urls" u WHERE ${where}`),
  ])
  const total = Number(counts[0]?.total ?? 0)
  const insecure = Number(counts[0]?.insecure ?? 0)
  const links: InsecureLink[] = rows.flatMap((r) => {
    const httpsUrl = toHttpsUrl(r.originalUrl)
    return httpsUrl ? [{ ...r, httpsUrl, createdAt: r.createdAt.toISOString() }] : []
  })
  return { links, total, insecure, sharePercent: insecureShare(insecure, total) }
}
