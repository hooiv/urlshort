import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

/** Real-Postgres check for the expired report. Opt-in via SOAK_DATABASE_URL. */
const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: expired links', () => {
  it.skipIf(!databaseUrl)('lists old active zero-click links oldest first and skips the rest', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { findExpiredLinks } = await import('./expired-links')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const [me, other] = await Promise.all(['me', 'other'].map((r) => db.user.create({ data: { email: `${r}-${tag}@example.com`, password: 'x' } })))
    try {
      const mk = (code: string, userId: string, extra: Record<string, unknown>) =>
        db.url.create({ data: { shortCode: `${code}${tag}`.slice(0, 40), originalUrl: 'https://example.com', userId, ...extra } })
      const older = await mk('a', me.id, { expiresAt: new Date(Date.now() - 5 * 86_400_000) })
      const newer = await mk('b', me.id, { expiresAt: new Date(Date.now() - 1 * 86_400_000) })
      const capped = await mk('c', me.id, { maxClicks: 3, clicks: 3 })
      await mk('d', me.id, { expiresAt: new Date(Date.now() + 86_400_000), maxClicks: 10, clicks: 2 })
      await mk('e', me.id, { expiresAt: new Date(Date.now() - 86_400_000), isActive: false })
      await mk('f', other.id, { expiresAt: new Date(Date.now() - 86_400_000) })

      const scope = { kind: 'user' as const, userId: me.id }
      const r = await findExpiredLinks(scope, 10)
      expect(r.total).toBe(3)
      expect(r.links.map((l) => l.id).sort()).toEqual([older.id, newer.id, capped.id].sort())
      expect(r.links.find((l) => l.id === capped.id)?.reason).toBe('click_limit')
      expect(r.links.find((l) => l.id === older.id)?.reason).toBe('expired')
      expect((await findExpiredLinks(scope, 1)).links).toHaveLength(1)
    } finally {
      await db.url.deleteMany({ where: { userId: { in: [me.id, other.id] } } })
      await db.user.deleteMany({ where: { id: { in: [me.id, other.id] } } })
      await db.$disconnect()
    }
  }, 60_000)
})
