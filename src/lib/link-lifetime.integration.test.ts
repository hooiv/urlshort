import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: link lifetime clock', () => {
  it.skipIf(!databaseUrl)('starts the clock once, even under concurrent first clicks', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { startLifetimeClock } = await import('./link-lifetime')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const url = await db.url.create({ data: { shortCode: `lt${tag}`.slice(0, 40), originalUrl: 'https://example.com', lifetimeMinutes: 5 } })
    try {
      const times = Array.from({ length: 8 }, (_, i) => new Date(Date.UTC(2026, 0, 1, 0, 0, i)))
      const results = await Promise.all(times.map((t) => startLifetimeClock(db, url.id, t)))
      const first = results[0]!.getTime()
      expect(results.every((r) => r!.getTime() === first)).toBe(true)
      expect(times.map((t) => t.getTime())).toContain(first)
      const stored = await db.url.findUniqueOrThrow({ where: { id: url.id }, select: { firstClickAt: true } })
      expect(stored.firstClickAt!.getTime()).toBe(first)
      expect(await startLifetimeClock(db, 'missing-id', new Date())).toBeNull()
    } finally {
      await db.url.delete({ where: { id: url.id } })
      await db.$disconnect()
    }
  })
})
