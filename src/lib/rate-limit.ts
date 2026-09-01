/**
 * Sliding-window rate limiter.
 *
 * In-memory by default (single instance, LRU-bounded). When REDIS_URL is set,
 * a Redis-backed sliding window shares the budget across serverless
 * instances. If Redis is down or misconfigured the limiter degrades to the
 * in-memory backend instead of failing requests — availability beats strict
 * limiting.
 */

import { isRedisConfigured, withRedis } from '@/lib/redis'

export type RateLimitResult = {
  allowed: boolean
  /** Requests remaining in the current window. */
  remaining: number
  /** Seconds until the window resets (0 when allowed). */
  retryAfterSeconds: number
  limit: number
}

export interface RateLimiterBackend {
  hit(key: string, limit: number, windowMs: number): Promise<RateLimitResult>
}

type Bucket = {
  /** Timestamps (ms) of hits inside the current window, ascending. */
  hits: number[]
  /** Last-access time for LRU eviction. */
  touchedAt: number
}

class InMemoryBackend implements RateLimiterBackend {
  private buckets = new Map<string, Bucket>()
  private maxBuckets: number

  constructor(maxBuckets = 50_000) {
    this.maxBuckets = maxBuckets
  }

  async hit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const now = Date.now()
    let bucket = this.buckets.get(key)

    if (!bucket) {
      bucket = { hits: [], touchedAt: now }
      this.buckets.set(key, bucket)
      this.evictIfNeeded()
    }
    bucket.touchedAt = now

    const windowStart = now - windowMs
    // Drop expired hits (ascending order, so shift from the front).
    while (bucket.hits.length && bucket.hits[0] <= windowStart) bucket.hits.shift()

    if (bucket.hits.length >= limit) {
      const oldest = bucket.hits[0]
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
        limit,
      }
    }

    bucket.hits.push(now)
    return { allowed: true, remaining: limit - bucket.hits.length, retryAfterSeconds: 0, limit }
  }

  private evictIfNeeded(): void {
    while (this.buckets.size > this.maxBuckets) {
      let oldestKey: string | null = null
      let oldestAt = Infinity
      for (const [key, bucket] of this.buckets) {
        if (bucket.touchedAt < oldestAt) {
          oldestAt = bucket.touchedAt
          oldestKey = key
        }
      }
      if (!oldestKey) break
      this.buckets.delete(oldestKey)
    }
  }
}

/**
 * Redis sliding window. Every request goes through `withRedis`, so transport
 * errors flip the connector into cooldown and the caller falls back to the
 * in-memory backend for that duration.
 */
class RedisBackend implements RateLimiterBackend {
  async hit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const fallback = memoryBackend.hit(key, limit, windowMs)
    const result = await withRedis(
      (redis) => this.hitRedis(redis, key, limit, windowMs),
      null as RateLimitResult | null
    )
    return result ?? fallback
  }

  private async hitRedis(
    redis: import('ioredis').Redis,
    key: string,
    limit: number,
    windowMs: number
  ): Promise<RateLimitResult> {
    const now = Date.now()
    const windowStart = now - windowMs
    const redisKey = `ratelimit:${key}`

    // A MULTI pipeline is not sufficient here: concurrent transactions can
    // all observe the same post-add count and then each remove their own hit,
    // causing a burst to be entirely rejected. Keep prune/add/count/rollback
    // in one Redis Lua invocation so the limit decision is linearizable.
    const member = `${now}-${Math.random().toString(36).slice(2)}`
    const result = await redis.eval(`
      redis.call('zremrangebyscore', KEYS[1], 0, ARGV[1])
      redis.call('zadd', KEYS[1], ARGV[2], ARGV[3])
      local count = redis.call('zcard', KEYS[1])
      redis.call('pexpire', KEYS[1], ARGV[4])
      if count > tonumber(ARGV[5]) then
        redis.call('zrem', KEYS[1], ARGV[3])
        local oldest = redis.call('zrange', KEYS[1], 0, 0, 'WITHSCORES')
        return {0, count - 1, oldest[2] or 0}
      end
      return {1, count, 0}
    `, 1, redisKey, windowStart, now, member, windowMs, limit) as [number, number, number]
    const allowed = Number(result[0]) === 1
    const hitsCount = Number(result[1])
    if (!allowed) {
      const oldestAt = Number(result[2])
      const retryAfterSeconds = Number.isFinite(oldestAt) && oldestAt > 0
        ? Math.max(1, Math.ceil((oldestAt + windowMs - now) / 1000))
        : 1
      return { allowed: false, remaining: 0, retryAfterSeconds, limit }
    }
    return { allowed: true, remaining: limit - hitsCount, retryAfterSeconds: 0, limit }
  }
}

const globalForLimiter = globalThis as unknown as { __qlRateLimiter?: RateLimiterBackend }
const memoryBackend = new InMemoryBackend()

function createBackend(): RateLimiterBackend {
  return isRedisConfigured() ? new RedisBackend() : memoryBackend
}

// Reuse across hot reloads/multiple module instances; safe because both
// backends are stateless w.r.t. requests and internally synchronized.
const backend: RateLimiterBackend = globalForLimiter.__qlRateLimiter ?? createBackend()
globalForLimiter.__qlRateLimiter = backend

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    // First entry is the originating client when set by a trusted proxy.
    const first = forwarded.split(',')[0].trim()
    if (first) return first
  }
  return request.headers.get('x-real-ip') || 'unknown'
}

export async function rateLimit(
  request: Request,
  options: { name: string; limit: number; windowMs: number; identifier?: string },
): Promise<RateLimitResult> {
  const identity = options.identifier ?? getClientIp(request)
  return backend.hit(`${options.name}:${identity}`, options.limit, options.windowMs)
}
