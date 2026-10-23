import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { scopeFilter, type AnalyticsScope } from './aggregate-analytics'

/**
 * Internal destinations: active links whose host only resolves inside a
 * private network (localhost, RFC1918, .local/.internal, single-label hosts).
 * These work for the author but are dead for every public visitor.
 */
export type InternalReason = 'loopback' | 'private-ip' | 'link-local' | 'internal-suffix' | 'single-label'

export const INTERNAL_URL_MAX = 200
export const INTERNAL_URL_DEFAULT = 50
const INTERNAL_SCAN_CAP = 2000
const INTERNAL_SUFFIXES = ['local', 'internal', 'lan', 'localdomain', 'intranet', 'corp', 'home', 'localhost']

export function parseInternalLimit(raw: string | null): number | null {
  if (raw === null || raw === '') return INTERNAL_URL_DEFAULT
  if (!/^\d{1,3}$/.test(raw)) return null
  const n = Number(raw)
  return n >= 1 && n <= INTERNAL_URL_MAX ? n : null
}

function ipv4(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (!m) return null
  const parts = m.slice(1).map(Number)
  return parts.every((p) => p <= 255) ? parts : null
}

/** Returns why a destination URL is only reachable internally, or null when it is public. */
export function classifyInternalUrl(raw: string): InternalReason | null {
  let host: string
  try {
    host = new URL(raw).hostname.toLowerCase().replace(/\.$/, '')
  } catch {
    return null
  }
  if (!host) return null
  if (host.startsWith('[') && host.endsWith(']')) {
    const v6 = host.slice(1, -1)
    if (v6 === '::1' || v6 === '::') return 'loopback'
    if (/^f[cd]/.test(v6)) return 'private-ip'
    if (/^fe[89ab]/.test(v6)) return 'link-local'
    return null
  }
  const ip = ipv4(host)
  if (ip) {
    const [a, b] = ip
    if (a === 127 || a === 0) return 'loopback'
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return 'private-ip'
    if (a === 169 && b === 254) return 'link-local'
    return null
  }
  if (host === 'localhost' || host.endsWith('.localhost')) return 'loopback'
  if (!host.includes('.')) return 'single-label'
  const tld = host.slice(host.lastIndexOf('.') + 1)
  return INTERNAL_SUFFIXES.includes(tld) ? 'internal-suffix' : null
}

export type InternalDestinationLink = {
  id: string
  shortCode: string
  title: string | null
  originalUrl: string
  reason: InternalReason
  clicks: number
}

type Row = { id: string; shortCode: string; title: string | null; originalUrl: string; clicks: number }

export async function findInternalDestinations(scope: AnalyticsScope, limit: number) {
  // Cheap SQL prefilter: skip hosts that are plainly public (contain a dot and a letter TLD) is unsafe for IPs,
  // so only exclude URLs whose host has a dotted name ending in 2+ letters that is not an internal suffix.
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT u."id", u."shortCode", u."title", u."originalUrl", u."clicks"
    FROM "urls" u
    WHERE ${scopeFilter(scope)} AND u."isActive" = true
      AND u."originalUrl" !~* '^https?://([^/?#@]*@)?[a-z0-9-]+(\.[a-z0-9-]+)*\.(?!(local|internal|lan|localdomain|intranet|corp|home|localhost)([:/?#]|$))[a-z]{2,}([:/?#]|$)'
    ORDER BY u."clicks" DESC, u."shortCode" ASC
    LIMIT ${INTERNAL_SCAN_CAP}`)
  const matches: InternalDestinationLink[] = []
  for (const r of rows) {
    const reason = classifyInternalUrl(r.originalUrl)
    if (reason) matches.push({ ...r, reason })
  }
  return { links: matches.slice(0, limit), total: matches.length, truncated: rows.length >= INTERNAL_SCAN_CAP }
}
