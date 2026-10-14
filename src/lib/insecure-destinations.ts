import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter, type AnalyticsScope } from './aggregate-analytics'

/**
 * Insecure destination audit: active links whose destination is plain http://.
 * Visitors on those links get a browser "Not secure" warning and are exposed to
 * tampering. Ordered by traffic so the most-visited fixes come first.
 * Localhost/loopback and private-network hosts are skipped (intentionally http).
 */
export const INSECURE_MAX_LIMIT = 200
export const INSECURE_DEFAULT_LIMIT = 50

export function parseInsecureLimit(raw: string | null): number | null {
  if (raw === null || raw === '') return INSECURE_DEFAULT_LIMIT
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return n >= 1 && n <= INSECURE_MAX_LIMIT ? n : null
}

/** Pure: is this an http:// URL pointing at a public-looking host? */
export function isInsecurePublicUrl(raw: string): boolean {
  let u: URL
  try { u = new URL(raw) } catch { return false }
  if (u.protocol !== 'http:') return false
  const h = u.hostname.toLowerCase()
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return false
  if (h === '[::1]' || h.startsWith('[fc') || h.startsWith('[fd') || h.startsWith('[fe80')) return false
  const m = h.match(/^(\d+)\.(\d+)\.\d+\.\d+$/)
  if (m) {
    const a = Number(m[1]), b = Number(m[2])
    if (a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254)) return false
  }
  return true
}

/** Pure: the https:// form of a destination, for the suggested fix. */
export function httpsUpgrade(raw: string): string | null {
  if (!isInsecurePublicUrl(raw)) return null
  const u = new URL(raw)
  u.protocol = 'https:'
  return u.toString()
}

export type InsecureLink = { id: string; shortCode: string; title: string | null; originalUrl: string; suggestedUrl: string; clicks: number }

export async function getInsecureLinks(scope: AnalyticsScope, limit: number) {
  const rows = await prisma.$queryRaw<{ id: string; shortCode: string; title: string | null; originalUrl: string; clicks: number }[]>(Prisma.sql`
    SELECT u."id", u."shortCode", u."title", u."originalUrl", u."clicks"
    FROM "urls" u
    WHERE ${scopeFilter(scope)} AND u."isActive" = true AND u."originalUrl" ILIKE 'http://%'
    ORDER BY u."clicks" DESC, u."shortCode" ASC
    LIMIT 2000`)
  const links: InsecureLink[] = []
  for (const r of rows) {
    const suggestedUrl = httpsUpgrade(r.originalUrl)
    if (suggestedUrl) links.push({ ...r, suggestedUrl })
  }
  return { total: links.length, truncated: links.length > limit, links: links.slice(0, limit) }
}
