/**
 * Shared Redis connector for optional backends (rate limiting, click queue).
 *
 * Design goals:
 *  - Zero-cost when unused: `ioredis` is imported dynamically only when a
 *    REDIS_URL is configured; the dependency is optional at runtime.
 *  - Graceful degradation: every accessor returns `null` when Redis is absent
 *    or unhealthy so callers fall back to the in-process implementation
 *    instead of taking the whole request path down. A failing Redis therefore
 *    costs capacity, never availability.
 *  - Single connection per process (serverless-friendly) with bounded retries
 *    and a failure cooldown that avoids hammering a dead instance on every
 *    request.
 */

type RedisClient = import('ioredis').Redis

const FAILURE_COOLDOWN_MS = 30_000

const globalForRedis = globalThis as unknown as {
  __qlRedis?: RedisClient | null
  __qlRedisDisabledUntil?: number
  __qlRedisConnecting?: Promise<RedisClient | null>
}

function disabledRecently(): boolean {
  const until = globalForRedis.__qlRedisDisabledUntil
  return typeof until === 'number' && Date.now() < until
}

function markUnhealthy(client: RedisClient | null | undefined): void {
  globalForRedis.__qlRedisDisabledUntil = Date.now() + FAILURE_COOLDOWN_MS
  if (client) {
    try { client.disconnect() } catch { /* already closed */ }
  }
  globalForRedis.__qlRedis = null
}

export function isRedisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL || (process.env.NODE_ENV === 'test' && process.env.SOAK_REDIS_URL))
}

/**
 * Returns a connected client, or `null` when Redis is not configured / cannot
 * be reached. Never throws.
 */
export async function getRedis(): Promise<RedisClient | null> {
  const url = process.env.REDIS_URL || (process.env.NODE_ENV === 'test' ? process.env.SOAK_REDIS_URL : undefined)
  if (!url) return null

  const existing = globalForRedis.__qlRedis
  if (existing && existing.status === 'ready') return existing
  if (disabledRecently()) return null
  if (globalForRedis.__qlRedisConnecting) return globalForRedis.__qlRedisConnecting

  const connecting = (async () => {
    let created: RedisClient | null = null
    try {
      const { default: Redis } = await import('ioredis')
      const client: RedisClient = new Redis(url, {
        // Serverless/lambda-style workloads churn instances; keep reconnects
        // capped and fail fast so request latency stays bounded.
        maxRetriesPerRequest: 2,
        connectTimeout: 5_000,
        commandTimeout: 2_000,
        retryStrategy: (times) => Math.min(times * 200, 2_000),
        enableOfflineQueue: false,
        lazyConnect: false,
      })
      client.on('error', () => { /* surfaced via status checks; avoid unhandled noise */ })
      await new Promise<void>((resolve, reject) => {
        const onReady = () => { cleanup(); resolve() }
        const onError = (err: Error) => { cleanup(); reject(err) }
        const cleanup = () => {
          client.removeListener('ready', onReady)
          client.removeListener('error', onError)
        }
        if (client.status === 'ready') return resolve()
        client.once('ready', onReady)
        client.once('error', onError)
      })
      created = client
      globalForRedis.__qlRedis = client
      globalForRedis.__qlRedisDisabledUntil = undefined
      return client
    } catch {
      markUnhealthy(created)
      return null
    } finally {
      globalForRedis.__qlRedisConnecting = undefined
    }
  })()

  globalForRedis.__qlRedisConnecting = connecting
  return connecting
}

/**
 * Run `fn` against Redis, returning its result; any transport error marks the
 * instance unhealthy (entering cooldown) and returns `fallback`.
 */
export async function withRedis<T>(
  fn: (client: RedisClient) => Promise<T>,
  fallback: T
): Promise<T> {
  const client = await getRedis()
  if (!client) return fallback
  try {
    return await fn(client)
  } catch (error) {
    console.error('Redis operation failed:', error)
    markUnhealthy(client)
    return fallback
  }
}

export function __resetRedisForTests(): void {
  const client = globalForRedis.__qlRedis
  try { client?.disconnect() } catch { /* test cleanup */ }
  globalForRedis.__qlRedis = null
  globalForRedis.__qlRedisDisabledUntil = undefined
  globalForRedis.__qlRedisConnecting = undefined
}
