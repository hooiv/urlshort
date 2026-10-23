import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter, type AnalyticsScope } from './aggregate-analytics'

/**
 * Dead-by-rule links: still marked active but past their expiry date or at
 * their click cap, so visitors already get the fallback. Most recently
 * expired first, so owners can extend or archive them.
 */
export const EXPIRED_MAX = 200
export const EXPIRED_DEFAULT = 50

export type ExpiredReason = 'expired' | 'click_limit'
export type ExpiredLink = {
  id: string; shortCode: string; title: string | null; originalUrl: string
  expiresAt: string | null; clicks: number; maxClicks: number | null; reason: ExpiredReason
}

export function parseExpiredLimit(raw: string | null): number | null {
  if (raw === null || raw === '') return EXPIRED_DEFAULT
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return n >= 1 && n <= EXPIRED_MAX ? n : null
}

/** Date expiry wins when both rules have tripped. */
export function expiredReason(l: { expiresAt: Date | null; clicks: number; maxClicks: number | null }, now: Date): ExpiredReason | null {
  if (l.expiresAt && l.expiresAt.getTime() <= now.getTime()) return 'expired'
  if (l.maxClicks !== null && l.clicks >= l.maxClicks) return 'click_limit'
  return null
}

type Row = { id: string; shortCode: string; title: string | null; originalUrl: string; expiresAt: Date | null; clicks: number; maxClicks: number | null }

export async function findExpiredLinks(scope: AnalyticsScope, limit: number, now = new Date()) {
  const where = Prisma.sql`${scopeFilter(scope)} AND u."isActive" = true AND ((u."expiresAt" IS NOT NULL AND u."expiresAt" <= ${now}) OR (u."maxClicks" IS NOT NULL AND u."clicks" >= u."maxClicks"))`
  const [rows, counts] = await Promise.all([
    prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT u."id", u."shortCode", u."title", u."originalUrl", u."expiresAt", u."clicks", u."maxClicks"
      FROM "urls" u WHERE ${where}
      ORDER BY COALESCE(u."expiresAt", u."updatedAt") DESC, u."shortCode" ASC LIMIT ${limit}`),
    prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`SELECT COUNT(*) AS n FROM "urls" u WHERE ${where}`),
  ])
  const links: ExpiredLink[] = rows.map((r) => ({
    id: r.id, shortCode: r.shortCode, title: r.title, originalUrl: r.originalUrl,
    expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null, clicks: r.clicks, maxClicks: r.maxClicks,
    reason: expiredReason(r, now) ?? 'click_limit',
  }))
  return { links, total: Number(counts[0]?.n ?? 0) }
}
