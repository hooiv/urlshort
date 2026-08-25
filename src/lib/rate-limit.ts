/**
 * Sliding-window rate limiter.
 *
 * Single-instance in-memory implementation with LRU eviction. The public API is
 * async so a Redis/Upstash backend can be swapped in behind the same interface
 * when the app scales horizontally (see `RateLimiterBackend`).
 */

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

const globalForLimiter = globalThis as unknown as { __qlRateLimiter?: RateLimiterBackend }
const backend: RateLimiterBackend = globalForLimiter.__qlRateLimiter ?? new InMemoryBackend()
if (process.env.NODE_ENV !== 'production') globalForLimiter.__qlRateLimiter = backend

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
