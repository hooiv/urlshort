import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

/** Real-Postgres check for the insecure report. Opt-in via SOAK_DATABASE_URL. */
const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: insecure links', () => {
  it.skipIf(!databaseUrl)('ranks active http links by clicks and ignores https, inactive and foreign links', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { findInsecureLinks } = await import('./insecure-links')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const [me, other] = await Promise.all(['me', 'other'].map((r) => db.user.create({ data: { email: `${r}-${tag}@example.com`, password: 'x' } })))
    try {
      const mk = (code: string, userId: string, extra: Record<string, unknown>) =>
        db.url.create({ data: { shortCode: `${code}${tag}`.slice(0, 40), originalUrl: 'https://example.com', userId, ...extra } })
      const low = await mk('a', me.id, { clicks: 1, originalUrl: 'http://example.com/low' })
      const high = await mk('b', me.id, { clicks: 9, originalUrl: 'HTTP://example.com/high:80' })
      await mk('c', me.id, { clicks: 50 })
      await mk('d', me.id, { clicks: 70, isActive: false, originalUrl: 'http://example.com/off' })
      await mk('e', other.id, { clicks: 99, originalUrl: 'http://example.com/other' })

      const result = await findInsecureLinks({ kind: 'user', userId: me.id }, 10)
      expect(result.links.map((l) => l.id)).toEqual([high.id, low.id])
      expect(result.total).toBe(3)
      expect(result.insecure).toBe(2)
      expect(result.sharePercent).toBe(67)
      expect(result.links[1].httpsUrl).toBe('https://example.com/low')
      expect((await findInsecureLinks({ kind: 'user', userId: me.id }, 1)).links).toHaveLength(1)
    } finally {
      await db.url.deleteMany({ where: { userId: { in: [me.id, other.id] } } })
      await db.user.deleteMany({ where: { id: { in: [me.id, other.id] } } })
      await db.$disconnect()
    }
  }, 60_000)
})
