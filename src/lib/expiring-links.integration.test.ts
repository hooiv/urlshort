import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: expiring links', () => {
  it.skipIf(!databaseUrl)('lists owned expiring and nearly-capped links, soonest first', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { listExpiringLinks } = await import('./expiring-links')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const user = await db.user.create({ data: { email: `ex-${tag}@example.com`, password: 'x' } })
    const now = new Date()
    const mk = (n: string, extra: Record<string, unknown>) => db.url.create({ data: { shortCode: `ex${n}${tag}`.slice(0, 40), originalUrl: 'https://example.com', userId: user.id, ...extra } })
    try {
      await mk('a', { expiresAt: new Date(now.getTime() + 2 * 86_400_000) })
      await mk('b', { expiresAt: new Date(now.getTime() + 1 * 86_400_000) })
      await mk('c', { expiresAt: new Date(now.getTime() + 30 * 86_400_000) })
      await mk('d', { maxClicks: 10, clicks: 9 })
      await mk('e', { maxClicks: 10, clicks: 1 })
      await mk('f', { expiresAt: new Date(now.getTime() + 86_400_000), isActive: false })
      const out = await listExpiringLinks(user.id, 7, 100, now)
      expect(out.map((l) => l.shortCode[2])).toEqual(['b', 'a', 'd'])
    } finally {
      await db.url.deleteMany({ where: { userId: user.id } })
      await db.user.delete({ where: { id: user.id } }).catch(() => undefined)
      await db.$disconnect()
    }
  }, 60_000)
})
