import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter, type AnalyticsScope } from './aggregate-analytics'

/**
 * Destinations that carry third-party click identifiers (fbclid, gclid, ...).
 * These are per-visitor, break caching/dedup, and leak identity; owners want
 * them stripped. UTM parameters are deliberately kept: they are intentional.
 */
export const TRACKING_PARAMS = ['fbclid', 'gclid', 'gbraid', 'wbraid', 'dclid', 'msclkid', 'twclid', 'ttclid', 'li_fat_id', 'yclid', 'igshid', 'mc_eid', '_hsenc', '_hsmi'] as const
export const DIRTY_MAX = 200
export const DIRTY_DEFAULT = 50

export type DirtyLink = { id: string; shortCode: string; title: string | null; originalUrl: string; cleanUrl: string; removed: string[]; clicks: number; createdAt: string }

export function parseDirtyLimit(raw: string | null): number | null {
  if (raw === null || raw === '') return DIRTY_DEFAULT
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return n >= 1 && n <= DIRTY_MAX ? n : null
}

/** Removes tracking identifiers; null when the URL is invalid or nothing was removed. */
export function stripTrackingParams(url: string): { cleanUrl: string; removed: string[] } | null {
  let u: URL
  try { u = new URL(url) } catch { return null }
  const removed: string[] = []
  for (const key of [...new Set([...u.searchParams.keys()])]) {
    if ((TRACKING_PARAMS as readonly string[]).includes(key.toLowerCase())) {
      removed.push(key)
      u.searchParams.delete(key)
    }
  }
  if (!removed.length) return null
  return { cleanUrl: u.toString(), removed }
}

type Row = { id: string; shortCode: string; title: string | null; originalUrl: string; clicks: number; createdAt: Date }

export async function findDirtyLinks(scope: AnalyticsScope, limit: number) {
  const pattern = '(^|[?&])(' + TRACKING_PARAMS.join('|') + ')='
  const where = Prisma.sql`${scopeFilter(scope)} AND u."isActive" = true AND u."originalUrl" ~* ${pattern}`
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT u."id", u."shortCode", u."title", u."originalUrl", u."clicks", u."createdAt"
    FROM "urls" u WHERE ${where}
    ORDER BY u."clicks" DESC, u."createdAt" ASC, u."shortCode" ASC
    LIMIT ${limit}`)
  const links: DirtyLink[] = rows.flatMap((r) => {
    const s = stripTrackingParams(r.originalUrl)
    return s ? [{ ...r, ...s, createdAt: r.createdAt.toISOString() }] : []
  })
  return { links, count: links.length }
}
