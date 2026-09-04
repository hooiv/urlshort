import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const { FakeRedis, instances } = vi.hoisted(() => {
  const store: { failNext: unknown; disconnect: ReturnType<typeof vi.fn>; status: string }[] = []
  class Fake {
    status = 'ready'
    disconnect = vi.fn()
    failNext: unknown = null
    constructor(
      public url?: string,
      public opts?: unknown,
    ) {
      store.push(this)
    }
    on() {
      return this
    }
    once() {
      return this
    }
    removeListener() {
      return this
    }
    async lpush(): Promise<number> {
      if (this.failNext) throw this.failNext
      return 1
    }
  }
  return { FakeRedis: Fake, instances: store }
})
vi.mock('ioredis', () => ({ default: FakeRedis }))

import { __resetRedisForTests, isRedisCoolingDown, withRedis } from './redis'

const OLD_ENV = process.env.REDIS_URL

describe('withRedis failure modes', () => {
  beforeEach(() => {
    instances.length = 0
    __resetRedisForTests()
    process.env.REDIS_URL = 'redis://localhost:6379'
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    __resetRedisForTests()
    if (OLD_ENV === undefined) delete process.env.REDIS_URL
    else process.env.REDIS_URL = OLD_ENV
  })

  it('does not poison the shared client on a non-transport command error', async () => {
    const fallback = { ok: false }
    const result = await withRedis(async () => {
      throw new Error('EVAL script failed: some deterministic bug')
    }, fallback)
    expect(result).toBe(fallback)
    expect(isRedisCoolingDown()).toBe(false)
    expect(instances[0].disconnect).not.toHaveBeenCalled()
    // The connection stays usable: the next operation still runs.
    const probe = vi.fn(async () => 'fine')
    await expect(withRedis(probe, 'fallback')).resolves.toBe('fine')
    expect(probe).toHaveBeenCalledTimes(1)
  })

  it('enters cooldown only on transport failures', async () => {
    const transport = new Error('connect ECONNREFUSED 127.0.0.1:6379') as Error & { code: string }
    transport.code = 'ECONNREFUSED'
    expect(await withRedis(async () => Promise.reject(transport), 'fallback')).toBe('fallback')
    expect(isRedisCoolingDown()).toBe(true)
    // During cooldown no new work is attempted (fail-fast to fallback).
    const probe = vi.fn(async () => 'never')
    await expect(withRedis(probe, 'fallback')).resolves.toBe('fallback')
    expect(probe).not.toHaveBeenCalled()
  })
})
