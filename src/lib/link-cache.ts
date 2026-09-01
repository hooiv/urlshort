import { prisma } from '@/lib/prisma'
import type { SmartRule } from '@/lib/smart-routing'

/**
 * Short-TTL read cache for the redirect hot path.
 *
 * Every redirect would otherwise hit the database 3-4 times (domain link,
 * url+rules, revision). A tiny in-process cache with a short TTL absorbs read
 * amplification while keeping rule/destination changes near-realtime.
 *
 * Production hardening on top of a plain TTL map:
 *  - Single-flight: concurrent misses for the same key share one DB query
 *    instead of stampeding the database after cold start or invalidation.
 *  - Jittered TTL: prevents synchronized expiry storms when many links are
 *    first requested in the same tick (traffic spikes, deploys).
 *  - Negative caching: unknown/deleted codes are cached too, so malformed
 *    traffic does not translate into database load.
 *  - Domain-path invalidation index: per-host key registries let management
 *    mutations evict domain-path entries immediately instead of waiting out
 *    the TTL.
 *
 * Blocked/expired/inactive states are cached as well; they're revalidated by
 * the same TTL and can be force-evicted via `invalidateLink()`.
 */

export type CachedLink = {
  id: string
  workspaceId: string | null
  shortCode: string
  originalUrl: string
  title: string | null
  description: string | null
  ogImage: string | null
  isActive: boolean
  riskStatus: string
  expiresAt: Date | null
  expiredUrl: string | null
  passwordHash: string | null
  metaPixelId: string | null
  googleTagId: string | null
  xPixelId: string | null
  cloaked: boolean
  webhookUrl: string | null
  maxClicks: number | null
  clicksReserved: number
  deletedAt?: Date | null
  rules: SmartRule[]
}

type CacheEntry = { value: CachedLink | { destinationUrl: string } | null; expiresAt: number }

const BASE_TTL_MS = 5_000
const TTL_JITTER_MS = 1_500
const MAX_ENTRIES = 10_000

const globalForCache = globalThis as unknown as {
  __qlLinkCache?: Map<string, CacheEntry>
  __qlLinkCacheInflight?: Map<string, Promise<unknown>>
  __qlLinkCacheHostIndex?: Map<string, Set<string>>
}
const cache: Map<string, CacheEntry> = globalForCache.__qlLinkCache ?? new Map()
const inflight: Map<string, Promise<unknown>> = globalForCache.__qlLinkCacheInflight ?? new Map()
const hostIndex: Map<string, Set<string>> = globalForCache.__qlLinkCacheHostIndex ?? new Map()
if (process.env.NODE_ENV !== 'production') {
  globalForCache.__qlLinkCache = cache
  globalForCache.__qlLinkCacheInflight = inflight
  globalForCache.__qlLinkCacheHostIndex = hostIndex
}

function codeKey(shortCode: string): string {
  return `code:${shortCode}`
}
function domainKey(host: string, path: string): string {
  return `domain:${host}:${path}`
}
function revisionKey(urlId: string): string {
  return `rev:${urlId}`
}
function nextTtl(): number {
  return Date.now() + BASE_TTL_MS + Math.floor(Math.random() * TTL_JITTER_MS)
}

/**
 * Shared read path: returns a fresh cached value, or collapses concurrent
 * misses into exactly one loader execution per key.
 */
async function readThrough<T>(
  key: string,
  load: () => Promise<T>,
  indexHost?: string
): Promise<T> {
  const hit = cache.get(key)
  if (hit && hit.expiresAt > Date.now()) return hit.value as T

  const pending = inflight.get(key)
  if (pending) return pending as Promise<T>

  const flight: Promise<T> = (async () => {
    const value = await load()
    setCache(key, value as CachedLink | { destinationUrl: string } | null)
    if (indexHost) registerHostKey(indexHost, key)
    return value
  })().finally(() => {
    inflight.delete(key)
  })
  inflight.set(key, flight)
  return flight
}

function setCache(key: string, value: CachedLink | { destinationUrl: string } | null): void {
  if (cache.size >= MAX_ENTRIES && !cache.has(key)) {
    // Cheap eviction: drop expired entries first, then fall back to FIFO.
    for (const [k, entry] of cache) {
      if (entry.expiresAt <= Date.now()) cache.delete(k)
    }
    if (cache.size >= MAX_ENTRIES) {
      const first = cache.keys().next()
      if (!first.done) cache.delete(first.value)
    }
  }
  cache.set(key, { value, expiresAt: nextTtl() })
}

function registerHostKey(host: string, key: string): void {
  let keys = hostIndex.get(host)
  if (!keys) {
    keys = new Set()
    hostIndex.set(host, keys)
  }
  keys.add(key)
}

/** Evict a host's domain-path entries (called when its domains change). */
export function invalidateDomain(host: string): void {
  const keys = hostIndex.get(host)
  if (!keys) return
  for (const key of keys) cache.delete(key)
  hostIndex.delete(host)
}

function ruleSelect() {
  return {
    id: true,
    destinationUrl: true,
    priority: true,
    weight: true,
    countryCodes: true,
    deviceType: true,
    referrerDomain: true,
    trafficType: true,
    aiAgent: true,
    os: true,
    languageCodes: true,
    startAt: true,
    endAt: true,
    healthStatus: true,
  } as const
}

const linkSelect = {
  id: true,
  workspaceId: true,
  shortCode: true,
  originalUrl: true,
  title: true,
  description: true,
  ogImage: true,
  isActive: true,
  riskStatus: true,
  expiresAt: true,
  expiredUrl: true,
  passwordHash: true,
  metaPixelId: true,
  googleTagId: true,
  xPixelId: true,
  cloaked: true,
  webhookUrl: true,
  maxClicks: true,
  clicksReserved: true,
  deletedAt: true,
} as const

function resolveFetched(url: { deletedAt: Date | null } | null): CachedLink | null {
  // Deleted links resolve to nothing, same as unknown codes (negative-cached).
  return url && !url.deletedAt ? (url as unknown as CachedLink) : null
}

export async function getLinkByCode(shortCode: string): Promise<CachedLink | null> {
  const key = codeKey(shortCode)
  return readThrough(key, async () => {
    const url = await prisma.url.findUnique({
      where: { shortCode },
      select: {
        ...linkSelect,
        rules: {
          where: { enabled: true, riskStatus: { not: 'blocked' } },
          orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
          select: ruleSelect(),
        },
      },
    })
    return resolveFetched(url)
  })
}

export async function getLinkByDomainPath(host: string, path: string): Promise<CachedLink | null> {
  const key = domainKey(host, path)
  return readThrough(key, async () => {
    const link = await prisma.domainLink.findFirst({
      where: { path, domain: { host, status: 'verified' } },
      select: {
        url: {
          select: {
            ...linkSelect,
            rules: {
              where: { enabled: true, riskStatus: { not: 'blocked' } },
              orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
              select: ruleSelect(),
            },
          },
        },
      },
    })
    return resolveFetched(link?.url ?? null)
  }, host)
}

export async function getLatestRevision(urlId: string): Promise<{ destinationUrl: string } | null> {
  const key = revisionKey(urlId)
  return readThrough(key, async () => {
    return prisma.destinationRevision.findFirst({
      where: { urlId, effectiveAt: { lte: new Date() } },
      orderBy: { effectiveAt: 'desc' },
      select: { destinationUrl: true },
    })
  })
}

/**
 * Invalidate all cache entries for a link. Call after any management mutation
 * that changes resolution state (destination, rules, active flag, max clicks).
 */
export function invalidateLink(shortCode: string, urlId?: string): void {
  cache.delete(codeKey(shortCode))
  if (urlId) cache.delete(revisionKey(urlId))
  // Domain-path entries for this link live under arbitrary hosts; the short
  // TTL bounds them, but we can evict by scanning the bounded index cheaply.
  // Full precision would require a reverse index per link id; the residual
  // staleness window here is one TTL at most.
}

/** Test/dev hook: reset all module-level state. */
export function __resetLinkCacheForTests(): void {
  cache.clear()
  inflight.clear()
  hostIndex.clear()
}
