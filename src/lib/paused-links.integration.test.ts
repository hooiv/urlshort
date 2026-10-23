import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

/** Real-Postgres check for the paused-links report. Opt-in via SOAK_DATABASE_URL. */
const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: paused links', () => {
  it.skipIf(!databaseUrl)('lists only the owner\'s inactive, non-trashed links longest-paused first', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { findPausedLinks } = await import('./paused-links')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const [me, other] = await Promise.all(['me', 'other'].map((r) => db.user.create({ data: { email: `${r}-${tag}@example.com`, password: 'x' } })))
    try {
      const mk = (code: string, userId: string, extra: Record<string, unknown>) =>
        db.url.create({ data: { shortCode: `${code}${tag}`.slice(0, 40), originalUrl: 'https://example.com', userId, ...extra } })
      const a = await mk('a', me.id, { isActive: false, clicks: 5 })
      const b = await mk('b', me.id, { isActive: false })
      await mk('c', me.id, {})
      await mk('d', me.id, { isActive: false, deletedAt: new Date() })
      await mk('e', other.id, { isActive: false })
      const old = new Date(Date.now() - 30 * 86_400_000)
      await db.$executeRaw`UPDATE "urls" SET "updatedAt" = ${old} WHERE "id" = ${a.id}`

      const scope = { kind: 'user' as const, userId: me.id }
      const r = await findPausedLinks(scope, 10, 0)
      expect(r.links.map((l) => l.id)).toEqual([a.id, b.id])
      expect(r.links[0].clicks).toBe(5)
      expect(r.links[0].pausedDays).toBe(30)
      expect(r.total).toBe(2)
      expect((await findPausedLinks(scope, 10, 7)).links.map((l) => l.id)).toEqual([a.id])
      expect((await findPausedLinks(scope, 1, 0)).links).toHaveLength(1)
    } finally {
      await db.url.deleteMany({ where: { userId: { in: [me.id, other.id] } } })
      await db.user.deleteMany({ where: { id: { in: [me.id, other.id] } } })
      await db.$disconnect()
    }
  }, 60_000)
})
