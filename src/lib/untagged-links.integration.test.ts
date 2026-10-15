import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

/** Real-Postgres check for the untagged report. Opt-in via SOAK_DATABASE_URL. */
const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: untagged links', () => {
  it.skipIf(!databaseUrl)('ranks active untagged links by clicks and ignores tagged, inactive and foreign links', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { findUntaggedLinks } = await import('./untagged-links')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const [me, other] = await Promise.all(['me', 'other'].map((r) => db.user.create({ data: { email: `${r}-${tag}@example.com`, password: 'x' } })))
    try {
      const mk = (code: string, userId: string, extra: Record<string, unknown>) =>
        db.url.create({ data: { shortCode: `${code}${tag}`.slice(0, 40), originalUrl: 'https://example.com', userId, ...extra } })
      const low = await mk('a', me.id, { clicks: 1 })
      const high = await mk('b', me.id, { clicks: 9 })
      await mk('c', me.id, { clicks: 50, tags: ['x'] })
      await mk('d', me.id, { clicks: 70, isActive: false })
      await mk('e', other.id, { clicks: 99 })

      const result = await findUntaggedLinks({ kind: 'user', userId: me.id }, 10)
      expect(result.links.map((l) => l.id)).toEqual([high.id, low.id])
      expect(result.total).toBe(3)
      expect(result.untagged).toBe(2)
      expect(result.sharePercent).toBe(67)
      expect((await findUntaggedLinks({ kind: 'user', userId: me.id }, 1)).links).toHaveLength(1)
    } finally {
      await db.url.deleteMany({ where: { userId: { in: [me.id, other.id] } } })
      await db.user.deleteMany({ where: { id: { in: [me.id, other.id] } } })
      await db.$disconnect()
    }
  }, 60_000)
})
