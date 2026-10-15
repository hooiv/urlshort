import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter, type AnalyticsScope } from './aggregate-analytics'
import { getBaseUrl } from './utils'

/**
 * Link chains: links whose destination is another QuickLink short link.
 * Every hop adds latency and a failure point (a deleted middle link breaks the
 * outer one), so we report the chain and the final destination to flatten to.
 */
export const CHAIN_MAX_HOPS = 10
export const CHAIN_SCAN_LIMIT = 5000

export type ChainLink = { shortCode: string; originalUrl: string }
export type LinkChain = {
  shortCode: string
  hops: string[] // short codes visited after the first link, in order
  finalUrl: string | null // first non-QuickLink destination; null when a cycle or the hop cap is hit
  status: 'chain' | 'cycle' | 'too_long'
}

/** Short code if `url` points at one of our hosts with a single path segment, else null. */
export function internalShortCode(url: string, hosts: ReadonlySet<string>): string | null {
  let u: URL
  try { u = new URL(url) } catch { return null }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  if (!hosts.has(u.host.toLowerCase())) return null
  const segs = u.pathname.split('/').filter(Boolean)
  if (segs.length !== 1) return null
  try { return decodeURIComponent(segs[0]) } catch { return null }
}

export function hostSet(baseUrls: string[], extraHosts: string[] = []): Set<string> {
  const out = new Set<string>()
  for (const b of baseUrls) { try { out.add(new URL(b).host.toLowerCase()) } catch { /* ignore malformed */ } }
  for (const h of extraHosts) if (h) out.add(h.toLowerCase())
  return out
}

/** Pure chain resolution over a snapshot of links. Links that are not chains are omitted. */
export function resolveChains(links: ChainLink[], hosts: ReadonlySet<string>, maxHops = CHAIN_MAX_HOPS): LinkChain[] {
  const byCode = new Map(links.map((l) => [l.shortCode, l.originalUrl]))
  const result: LinkChain[] = []
  for (const link of links) {
    const next = internalShortCode(link.originalUrl, hosts)
    if (next === null) continue
    const seen = new Set([link.shortCode])
    const hops: string[] = []
    let status: LinkChain['status'] = 'chain'
    let finalUrl: string | null = null
    let current: string | null = next
    while (current !== null) {
      if (seen.has(current)) { status = 'cycle'; break }
      if (hops.length >= maxHops) { status = 'too_long'; break }
      const dest = byCode.get(current)
      if (dest === undefined) { finalUrl = null; hops.push(current); status = 'chain'; break } // target missing from scope
      seen.add(current)
      hops.push(current)
      const n = internalShortCode(dest, hosts)
      if (n === null) { finalUrl = dest; break }
      current = n
    }
    result.push({ shortCode: link.shortCode, hops, finalUrl, status })
  }
  return result.sort((a, b) => b.hops.length - a.hops.length || a.shortCode.localeCompare(b.shortCode))
}

export async function findLinkChains(scope: AnalyticsScope, extraHosts: string[] = []) {
  const rows = await prisma.$queryRaw<ChainLink[]>(Prisma.sql`
    SELECT u."shortCode", u."originalUrl" FROM "urls" u
    WHERE ${scopeFilter(scope)} AND u."isActive" = true
    ORDER BY u."createdAt" DESC LIMIT ${CHAIN_SCAN_LIMIT}`)
  const chains = resolveChains(rows, hostSet([getBaseUrl()], extraHosts))
  return { chains, scanned: rows.length, truncated: rows.length === CHAIN_SCAN_LIMIT }
}
