import { prisma } from '@/lib/prisma'
import type { SmartRule } from '@/lib/smart-routing'

/**
 * Short-TTL read cache for the redirect hot path.
 *
 * Every redirect previously hit the database 3–4 times (domain link, url+rules,
 * revision). A tiny in-process cache with a short TTL absorbs read amplification
 * while keeping rule/destination changes near-realtime (≤5s staleness).
 *
 * Blocked/expired/inactive states are cached too — they're revalidated by the
 * same TTL, and management actions (block, deactivate) can call `invalidate()`.
 */

export type CachedLink = {
  id: string
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
  deletedAt?: Date | null
  rules: SmartRule[]
}

type CacheEntry = { value: CachedLink | null; expiresAt: number }

const TTL_MS = 5_000
const MAX_ENTRIES = 10_000

const globalForCache = globalThis as unknown as { __qlLinkCache?: Map<string, CacheEntry> }
const cache: Map<string, CacheEntry> = globalForCache.__qlLinkCache ?? new Map()
if (process.env.NODE_ENV !== 'production') globalForCache.__qlLinkCache = cache

function ruleSelect() {
  return {
    id: true,
    destinationUrl: true,
    priority: true,
    weight: true,
    countryCodes: true,
    deviceType: true,
    referrerDomain: true,
    startAt: true,
    endAt: true,
    healthStatus: true,
  } as const
}

export async function getLinkByCode(shortCode: string): Promise<CachedLink | null> {
  const key = `code:${shortCode}`
  const hit = cache.get(key)
  const now = Date.now()
  if (hit && hit.expiresAt > now) return hit.value

  const url = await prisma.url.findUnique({
    where: { shortCode },
    select: {
      id: true,
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
      deletedAt: true,
      rules: { where: { enabled: true, riskStatus: { not: 'blocked' } }, orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }], select: ruleSelect() },
    },
  })
  // Deleted links resolve to nothing, same as unknown codes.
  const value = (url && !url.deletedAt ? url : null) as CachedLink | null
  setCache(key, value)
  return value
}

export async function getLinkByDomainPath(host: string, path: string): Promise<CachedLink | null> {
  const key = `domain:${host}:${path}`
  const hit = cache.get(key)
  const now = Date.now()
  if (hit && hit.expiresAt > now) return hit.value

  const link = await prisma.domainLink.findFirst({
    where: { path, domain: { host, status: 'verified' } },
    select: {
      url: {
        select: {
          id: true,
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
          deletedAt: true,
          rules: { where: { enabled: true, riskStatus: { not: 'blocked' } }, orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }], select: ruleSelect() },
        },
      },
    },
  })
  const resolved = link?.url && !link.url.deletedAt ? link.url : null
  const value = (resolved as CachedLink | null) ?? null
  setCache(key, value)
  return value
}

export async function getLatestRevision(urlId: string): Promise<{ destinationUrl: string } | null> {
  const key = `rev:${urlId}`
  const hit = cache.get(key)
  const now = Date.now()
  if (hit && hit.expiresAt > now) return hit.value as { destinationUrl: string } | null

  const revision = await prisma.destinationRevision.findFirst({
    where: { urlId, effectiveAt: { lte: new Date() } },
    orderBy: { effectiveAt: 'desc' },
    select: { destinationUrl: true },
  })
  setCache(key, revision)
  return revision
}

function setCache(key: string, value: CachedLink | { destinationUrl: string } | null): void {
  if (cache.size >= MAX_ENTRIES) {
    // Cheap eviction: clear expired first, then drop the oldest insertion.
    const now = Date.now()
    for (const [k, entry] of cache) {
      if (entry.expiresAt <= now) cache.delete(k)
    }
    if (cache.size >= MAX_ENTRIES) {
      const first = cache.keys().next()
      if (!first.done) cache.delete(first.value)
    }
  }
  cache.set(key, { value: value as CachedLink | null, expiresAt: Date.now() + TTL_MS })
}

/** Invalidate all cache entries for a link (call after management mutations). */
export function invalidateLink(shortCode: string, urlId?: string): void {
  cache.delete(`code:${shortCode}`)
  if (urlId) cache.delete(`rev:${urlId}`)
  // Domain-path entries are keyed by host+path which we can't enumerate cheaply;
  // the 5s TTL bounds their staleness, which is acceptable for this tier.
}
