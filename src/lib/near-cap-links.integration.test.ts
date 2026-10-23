import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

/** Real-Postgres check for the near-cap report. Opt-in via SOAK_DATABASE_URL. */
const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: near-cap links', () => {
  it.skipIf(!databaseUrl)('lists active capped links over the threshold, closest first', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { findNearCapLinks } = await import('./near-cap-links')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const [me, other] = await Promise.all(['me', 'other'].map((r) => db.user.create({ data: { email: `${r}-${tag}@example.com`, password: 'x' } })))
    try {
      const mk = (code: string, userId: string, extra: Record<string, unknown>) =>
        db.url.create({ data: { shortCode: `${code}${tag}`.slice(0, 40), originalUrl: 'https://example.com', userId, ...extra } })
      const close = await mk('a', me.id, { maxClicks: 100, clicks: 99 })
      const edge = await mk('b', me.id, { maxClicks: 10, clicks: 8 })
      await mk('c', me.id, { maxClicks: 10, clicks: 7 })
      await mk('d', me.id, { maxClicks: 10, clicks: 10 })
      await mk('e', me.id, { clicks: 50 })
      await mk('f', me.id, { maxClicks: 10, clicks: 9, isActive: false })
      await mk('g', other.id, { maxClicks: 10, clicks: 9 })

      const scope = { kind: 'user' as const, userId: me.id }
      const r = await findNearCapLinks(scope, 10, 80)
      expect(r.total).toBe(2)
      expect(r.links.map((l) => l.id)).toEqual([close.id, edge.id])
      expect(r.links[0]).toMatchObject({ percentUsed: 99, remaining: 1 })
      expect((await findNearCapLinks(scope, 10, 70)).total).toBe(3)
      expect((await findNearCapLinks(scope, 1, 80)).links).toHaveLength(1)
    } finally {
      await db.url.deleteMany({ where: { userId: { in: [me.id, other.id] } } })
      await db.user.deleteMany({ where: { id: { in: [me.id, other.id] } } })
      await db.$disconnect()
    }
  }, 60_000)
})
