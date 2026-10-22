import { prisma } from '@/lib/prisma'
import type { SmartRule } from '@/lib/smart-routing'
import { ensureBusListener, isBusConnected, publishInvalidation, busStats, type InvalidationTargets } from '@/lib/link-cache-bus'

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
 *  - Reverse indexes: every entry is registered under the link id it
 *    resolved to and the host it was read for, so `invalidateLink()` evicts
 *    the short-code entry, every custom-domain path pointing at the link and
 *    its revision entry, and `invalidateDomain()` evicts a host's paths
 *    (including negative entries), all without waiting out the TTL.
 *  - Generation-safe single-flight: an invalidation that lands while a load
 *    is in flight marks that flight stale, so the pre-mutation row it read is
 *    returned to its own waiters but never written into the cache.
 *  - Cross-instance invalidation (`link-cache-bus`): with Redis configured,
 *    invalidations are broadcast to every instance. While that subscription
 *    is healthy entries live for the long TTL; when it drops the cache
 *    flushes and returns to the short TTL, since missed messages are unknown.
 *  - Scheduled revisions cap their entry at the next revision's effectiveAt,
 *    so a long TTL never delays a scheduled destination change.
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
  startsAt: Date | null
  notStartedUrl: string | null
  geoFence: unknown
  visitorBlock: unknown
  activeHours: unknown
  offHoursUrl: string | null
  clickIdParam: string | null
  queryForwardMode: string
  queryForwardAllow: string[]
  redirectStatus: number | null
  passwordHash: string | null
  metaPixelId: string | null
  googleTagId: string | null
  xPixelId: string | null
  linkedinPartnerId: string | null
  tiktokPixelId: string | null
  pinterestTagId: string | null
  cloaked: boolean
  webhookUrl: string | null
  maxClicks: number | null
  clicksReserved: number
  dailyClickCap: number | null
  deletedAt?: Date | null
  rules: SmartRule[]
}

type CacheValue = CachedLink | { destinationUrl: string } | null
type CacheEntry = { value: CacheValue; expiresAt: number; urlId?: string; host?: string }
type Flight = { promise: Promise<unknown>; stale: boolean }
type LoadResult<T> = { value: T; urlId?: string; host?: string; notAfter?: number }

function envMs(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name])
  return Number.isFinite(raw) && raw >= min && raw <= max ? Math.floor(raw) : fallback
}

/** TTL without a healthy invalidation bus: the staleness bound for other instances. */
const SHORT_TTL_MS = envMs('QL_LINK_CACHE_TTL_MS', 5_000, 500, 60_000)
/** TTL while the bus is subscribed: invalidations arrive immediately, the TTL is only a backstop. */
const BUS_TTL_MS = envMs('QL_LINK_CACHE_BUS_TTL_MS', 60_000, 1_000, 15 * 60_000)
const MAX_ENTRIES = envMs('QL_LINK_CACHE_MAX_ENTRIES', 10_000, 100, 1_000_000)

const globalForCache = globalThis as unknown as {
  __qlLinkCache?: Map<string, CacheEntry>
  __qlLinkCacheInflight?: Map<string, Flight>
  __qlLinkCacheHostIndex?: Map<string, Set<string>>
  __qlLinkCacheUrlIndex?: Map<string, Set<string>>
}
const cache: Map<string, CacheEntry> = globalForCache.__qlLinkCache ?? new Map()
const inflight: Map<string, Flight> = globalForCache.__qlLinkCacheInflight ?? new Map()
const hostIndex: Map<string, Set<string>> = globalForCache.__qlLinkCacheHostIndex ?? new Map()
const urlIndex: Map<string, Set<string>> = globalForCache.__qlLinkCacheUrlIndex ?? new Map()
if (process.env.NODE_ENV !== 'production') {
  globalForCache.__qlLinkCache = cache
  globalForCache.__qlLinkCacheInflight = inflight
  globalForCache.__qlLinkCacheHostIndex = hostIndex
  globalForCache.__qlLinkCacheUrlIndex = urlIndex
}

const stats = { hits: 0, misses: 0, coalesced: 0, staleLoadsDiscarded: 0, localInvalidations: 0, remoteInvalidations: 0, flushes: 0 }

function codeKey(shortCode: string): string {
  return `code:${shortCode}`
}
function domainKey(host: string, path: string): string {
  return `domain:${host}:${path}`
}
function revisionKey(urlId: string): string {
  return `rev:${urlId}`
}

/** Current base TTL plus up to 30% jitter, capped by `notAfter` when given. */
function nextExpiry(notAfter?: number): number {
  const base = isBusConnected() ? BUS_TTL_MS : SHORT_TTL_MS
  const expiry = Date.now() + base + Math.floor(Math.random() * base * 0.3)
  return notAfter !== undefined ? Math.min(expiry, notAfter) : expiry
}

const busHandlers = {
  onMessage: (targets: InvalidationTargets) => {
    stats.remoteInvalidations += 1
    evictLocal(targets)
  },
  // A (re)connected subscription cannot replay what it missed, and entries
  // written during the outage used the short TTL anyway; start clean.
  onConnected: () => flushAll(),
  // From now on invalidations can be missed: drop the long-lived entries.
  onDisconnect: () => flushAll(),
}

function addToIndex(index: Map<string, Set<string>>, id: string, key: string): void {
  let keys = index.get(id)
  if (!keys) {
    keys = new Set()
    index.set(id, keys)
  }
  keys.add(key)
}

function removeFromIndex(index: Map<string, Set<string>>, id: string | undefined, key: string): void {
  if (!id) return
  const keys = index.get(id)
  if (!keys) return
  keys.delete(key)
  if (keys.size === 0) index.delete(id)
}

/** Remove one key from the cache and both reverse indexes; mark its flight stale. */
function deleteKey(key: string): void {
  const entry = cache.get(key)
  if (entry) {
    cache.delete(key)
    removeFromIndex(urlIndex, entry.urlId, key)
    removeFromIndex(hostIndex, entry.host, key)
  }
  const flight = inflight.get(key)
  if (flight) {
    flight.stale = true
    inflight.delete(key)
  }
}

function setCache(key: string, result: LoadResult<CacheValue>): void {
  const existing = cache.get(key)
  if (existing) deleteKey(key)
  else if (cache.size >= MAX_ENTRIES) {
    // Cheap eviction: drop expired entries first, then fall back to FIFO.
    const now = Date.now()
    for (const [k, entry] of cache) {
      if (entry.expiresAt <= now) deleteKey(k)
    }
    if (cache.size >= MAX_ENTRIES) {
      const first = cache.keys().next()
      if (!first.done) deleteKey(first.value)
    }
  }
  cache.set(key, { value: result.value, expiresAt: nextExpiry(result.notAfter), urlId: result.urlId, host: result.host })
  if (result.urlId) addToIndex(urlIndex, result.urlId, key)
  if (result.host) addToIndex(hostIndex, result.host, key)
}

/**
 * Shared read path: returns a fresh cached value, or collapses concurrent
 * misses into exactly one loader execution per key.
 */
async function readThrough<T extends CacheValue>(key: string, load: () => Promise<LoadResult<T>>): Promise<T> {
  void ensureBusListener(busHandlers)
  const hit = cache.get(key)
  if (hit && hit.expiresAt > Date.now()) {
    stats.hits += 1
    return hit.value as T
  }

  const pending = inflight.get(key)
  if (pending) {
    stats.coalesced += 1
    return pending.promise as Promise<T>
  }

  stats.misses += 1
  const flight: Flight = { promise: Promise.resolve(), stale: false }
  flight.promise = (async () => {
    const result = await load()
    if (flight.stale) stats.staleLoadsDiscarded += 1
    else setCache(key, result)
    return result.value
  })().finally(() => {
    if (inflight.get(key) === flight) inflight.delete(key)
  })
  inflight.set(key, flight)
  return flight.promise as Promise<T>
}

function evictLocal(targets: InvalidationTargets): void {
  if (targets.all) {
    flushAll()
    return
  }
  for (const code of targets.codes ?? []) deleteKey(codeKey(code))
  for (const id of targets.ids ?? []) {
    deleteKey(revisionKey(id))
    for (const key of [...(urlIndex.get(id) ?? [])]) deleteKey(key)
  }
  for (const host of targets.hosts ?? []) {
    for (const key of [...(hostIndex.get(host) ?? [])]) deleteKey(key)
  }
}

function flushAll(): void {
  stats.flushes += 1
  cache.clear()
  urlIndex.clear()
  hostIndex.clear()
  for (const flight of inflight.values()) flight.stale = true
  inflight.clear()
}

async function invalidate(targets: InvalidationTargets): Promise<void> {
  stats.localInvalidations += 1
  evictLocal(targets)
  await publishInvalidation(targets)
}

/** Evict a host's domain-path entries (called when its domains or paths change). */
export function invalidateDomain(host: string): Promise<void> {
  return invalidate({ hosts: [host] })
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
    schedule: true,
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
  startsAt: true,
  notStartedUrl: true,
  geoFence: true,
  visitorBlock: true,
  activeHours: true,
  offHoursUrl: true,
  clickIdParam: true,
  queryForwardMode: true,
  queryForwardAllow: true,
  redirectStatus: true,
  passwordHash: true,
  metaPixelId: true,
  googleTagId: true,
  xPixelId: true,
  linkedinPartnerId: true,
  tiktokPixelId: true,
  pinterestTagId: true,
  cloaked: true,
  webhookUrl: true,
  maxClicks: true,
  clicksReserved: true,
  dailyClickCap: true,
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
    const value = resolveFetched(url)
    return { value, urlId: value?.id }
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
    const value = resolveFetched(link?.url ?? null)
    return { value, urlId: value?.id, host }
  })
}

export async function getLatestRevision(urlId: string): Promise<{ destinationUrl: string } | null> {
  const key = revisionKey(urlId)
  return readThrough(key, async () => {
    const now = new Date()
    const [current, next] = await Promise.all([
      prisma.destinationRevision.findFirst({
        where: { urlId, effectiveAt: { lte: now } },
        orderBy: { effectiveAt: 'desc' },
        select: { destinationUrl: true },
      }),
      prisma.destinationRevision.findFirst({
        where: { urlId, effectiveAt: { gt: now } },
        orderBy: { effectiveAt: 'asc' },
        select: { effectiveAt: true },
      }),
    ])
    return { value: current, urlId, notAfter: next?.effectiveAt.getTime() }
  })
}

/**
 * Invalidate every cache entry for a link: its short code, the custom-domain
 * paths that resolved to it and its revision, on this instance and (via the
 * bus) on every other one. Call after any mutation that changes resolution
 * state: destination, rules, rule health, active flag, safety status, max
 * clicks, deletion, or creation (to clear a negative entry for the code).
 */
export function invalidateLink(shortCode: string, urlId?: string): Promise<void> {
  return invalidate({ codes: [shortCode], ids: urlId ? [urlId] : [] })
}

/** Batch form of `invalidateLink` for sweeps and bulk operations. */
export function invalidateLinks(links: Array<{ shortCode?: string | null; id?: string | null }>): Promise<void> {
  if (links.length === 0) return Promise.resolve()
  const codes: string[] = []
  const ids: string[] = []
  for (const link of links) {
    if (link.shortCode) codes.push(link.shortCode)
    if (link.id) ids.push(link.id)
  }
  return invalidate({ codes, ids })
}

/** Point-in-time counters for health endpoints and load tests. */
export function getLinkCacheStats() {
  return { ...stats, size: cache.size, inflight: inflight.size, indexedLinks: urlIndex.size, indexedHosts: hostIndex.size, ttlMs: isBusConnected() ? BUS_TTL_MS : SHORT_TTL_MS, bus: busStats() }
}

/** Test/dev hook: reset all module-level state. */
export function __resetLinkCacheForTests(): void {
  cache.clear()
  inflight.clear()
  hostIndex.clear()
  urlIndex.clear()
  for (const k of Object.keys(stats) as Array<keyof typeof stats>) stats[k] = 0
}
