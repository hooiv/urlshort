import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { execFileSync } from 'node:child_process'

const databaseUrl = process.env.SOAK_DATABASE_URL
const redisUrl = process.env.SOAK_REDIS_URL
const live = Boolean(databaseUrl && redisUrl)

function redisService(action: 'start' | 'stop') {
  const command = action === 'stop' ? "redis-cli -p 16379 shutdown >/dev/null 2>&1 || true" : "mkdir -p /tmp/redis-soak && redis-server --bind 0.0.0.0 --port 16379 --appendonly yes --appendfsync always --dir /tmp/redis-soak --daemonize yes >/dev/null 2>&1 || true"; execFileSync('wsl.exe', ['-d', 'Ubuntu-26.04', '-u', 'root', '--', 'bash', '-lc', command], { stdio: 'ignore' })
}

describe('live Redis/Postgres failure soak', () => {
  it.skipIf(!live)('falls back to Postgres when Redis is unavailable', async () => {
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl! } } })
    const slug = `redis-fallback-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const workspace = await db.workspace.create({ data: { name: slug, slug } })
    const url = await db.url.create({ data: { workspaceId: workspace.id, shortCode: `r${Date.now()}`, originalUrl: 'https://example.com' } })
    const eventId = `redis-down-${Date.now()}-${Math.random().toString(36).slice(2)}`
    try {
      redisService('stop')
      process.env.REDIS_URL = redisUrl!
      const { clickQueue } = await import('./queue')
      await clickQueue.push({ clickEventId: eventId, urlId: url.id, shortCode: url.shortCode, dateKey: '2026-09-01' })
      expect(await db.clickEvent.findUnique({ where: { id: eventId } })).not.toBeNull()
    } finally {
      redisService('start')
      await db.workspace.delete({ where: { id: workspace.id } })
      await db.$disconnect()
    }
  }, 30000)

  it.skipIf(!live)('reclaims a processing entry after Redis worker loss and persists exactly once', async () => {
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl! } } })
    const slug = `redis-reclaim-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const workspace = await db.workspace.create({ data: { name: slug, slug } })
    const url = await db.url.create({ data: { workspaceId: workspace.id, shortCode: `q${Date.now()}`, originalUrl: 'https://example.com' } })
    const eventId = `redis-reclaim-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const payload = JSON.stringify({ clickEventId: eventId, urlId: url.id, shortCode: url.shortCode, dateKey: '2026-09-01' })
    try {
      redisService('start')
      const { __resetRedisForTests } = await import('./redis')
      __resetRedisForTests()
      await new Promise(resolve => setTimeout(resolve, 500))
      const Redis = (await import('ioredis')).default
      const r = new Redis(redisUrl!, { enableOfflineQueue: false })
      await new Promise<void>((resolve, reject) => { if (r.status === 'ready') return resolve(); r.once('ready', () => resolve()); r.once('error', reject) })
      await r.lpush('click_queue', payload)
      await r.rpoplpush('click_queue', 'click_queue_processing')
      await r.quit()
      redisService('stop')
      process.env.REDIS_URL = redisUrl!
      const { clickQueue } = await import('./queue')
      await clickQueue.processBatch()
      expect(await db.clickEvent.findUnique({ where: { id: eventId } })).toBeNull()
      redisService('start')
      __resetRedisForTests()
      const probe = new Redis(redisUrl!, { enableOfflineQueue: false })
      await new Promise<void>((resolve, reject) => { if (probe.status === 'ready') return resolve(); probe.once('ready', () => resolve()); probe.once('error', reject) })
      await probe.quit()
      __resetRedisForTests()
      await clickQueue.processBatch()
      expect(await db.clickEvent.findUnique({ where: { id: eventId } })).not.toBeNull()
      await clickQueue.processBatch()
      expect(await db.clickEvent.count({ where: { id: eventId } })).toBe(1)
    } finally {
      redisService('start')
      await db.workspace.delete({ where: { id: workspace.id } })
      await db.$disconnect()
    }
  }, 30000)

  it.skipIf(!live)('quarantines malformed Redis payloads instead of silently dropping them', async () => {
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl! } } })
    try {
      redisService('start')
      process.env.REDIS_URL = redisUrl!
      const { __resetRedisForTests } = await import('./redis')
      __resetRedisForTests()
      await new Promise(resolve => setTimeout(resolve, 500))
      const Redis = (await import('ioredis')).default
      const r = new Redis(redisUrl!, { enableOfflineQueue: false })
      await new Promise<void>((resolve, reject) => { if (r.status === 'ready') return resolve(); r.once('ready', () => resolve()); r.once('error', reject) })
      const malformed = JSON.stringify({ clickEventId: '', urlId: 'missing-required-id' })
      await r.lpush('click_queue', malformed)
      await r.quit()

      const { clickQueue } = await import('./queue')
      await clickQueue.processBatch()

      const probe = new Redis(redisUrl!, { enableOfflineQueue: false })
      await new Promise<void>((resolve, reject) => { if (probe.status === 'ready') return resolve(); probe.once('ready', () => resolve()); probe.once('error', reject) })
      expect(await probe.lrange('click_queue_dlq', 0, -1)).toContain(malformed)
      expect(await probe.lrem('click_queue_processing', 0, malformed)).toBe(0)
      await probe.lrem('click_queue_dlq', 0, malformed)
      await probe.quit()
    } finally {
      redisService('start')
      await db.$disconnect()
    }
  }, 30000)
})
