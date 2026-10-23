import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

/** Real-Postgres check for the never-clicked report. Opt-in via SOAK_DATABASE_URL. */
const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: never-clicked links', () => {
  it.skipIf(!databaseUrl)('lists old active zero-click links oldest first and skips the rest', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { findNeverClickedLinks } = await import('./never-clicked-links')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const [me, other] = await Promise.all(['me', 'other'].map((r) => db.user.create({ data: { email: `${r}-${tag}@example.com`, password: 'x' } })))
    const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000)
    try {
      const mk = (code: string, userId: string, extra: Record<string, unknown>) =>
        db.url.create({ data: { shortCode: `${code}${tag}`.slice(0, 40), originalUrl: 'https://example.com', userId, ...extra } })
      const oldest = await mk('a', me.id, { createdAt: daysAgo(30) })
      const newer = await mk('b', me.id, { createdAt: daysAgo(10) })
      await mk('c', me.id, { createdAt: daysAgo(2) })
      await mk('d', me.id, { createdAt: daysAgo(40), clicks: 1 })
      await mk('e', me.id, { createdAt: daysAgo(40), isActive: false })
      await mk('f', other.id, { createdAt: daysAgo(40) })

      const scope = { kind: 'user' as const, userId: me.id }
      const r = await findNeverClickedLinks(scope, 10, 7)
      expect(r.links.map((l) => l.id)).toEqual([oldest.id, newer.id])
      expect(r.links[0].ageDays).toBe(30)
      expect(r.total).toBe(2)
      expect((await findNeverClickedLinks(scope, 10, 0)).total).toBe(3)
      expect((await findNeverClickedLinks(scope, 1, 7)).links).toHaveLength(1)
    } finally {
      await db.url.deleteMany({ where: { userId: { in: [me.id, other.id] } } })
      await db.user.deleteMany({ where: { id: { in: [me.id, other.id] } } })
      await db.$disconnect()
    }
  }, 60_000)
})
