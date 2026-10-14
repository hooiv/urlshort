import { describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: auto-archive', () => {
  it.skipIf(!databaseUrl)('archives only idle personal links of opted-in owners, audited, idempotent', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const sent: string[] = []
    vi.doMock('./email', () => ({ sendEmail: async (m: { to: string }) => (sent.push(m.to), true) }))
    vi.doMock('./link-cache', () => ({ invalidateLinks: async () => {} }))
    const { autoArchiveStaleLinks } = await import('./auto-archive')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const old = new Date(Date.now() - 200 * 86_400_000)
    const on = await db.user.create({ data: { email: `aa-on-${tag}@example.com`, password: 'x', autoArchiveStaleDays: 90 } })
    const off = await db.user.create({ data: { email: `aa-off-${tag}@example.com`, password: 'x' } })
    const mk = (n: string, userId: string, createdAt: Date) => db.url.create({ data: { shortCode: `aa${n}${tag}`.slice(0, 40), originalUrl: 'https://example.com', userId, createdAt } })
    const idle = await mk('a', on.id, old)
    const fresh = await mk('b', on.id, new Date())
    const active = await mk('c', on.id, old)
    const other = await mk('d', off.id, old)
    try {
      await db.clickEvent.create({ data: { urlId: active.id, trafficType: 'human' } })
      const first = await autoArchiveStaleLinks('https://q.l')
      expect(first.links).toBeGreaterThanOrEqual(1)
      const state = async (id: string) => (await db.url.findUnique({ where: { id } }))?.isActive
      expect(await state(idle.id)).toBe(false)
      expect(await state(fresh.id)).toBe(true)
      expect(await state(active.id)).toBe(true)
      expect(await state(other.id)).toBe(true)
      expect(await db.auditEvent.count({ where: { urlId: idle.id, action: 'link.auto_archive' } })).toBe(1)
      expect(sent.filter((t) => t === on.email)).toHaveLength(1)
      await autoArchiveStaleLinks('https://q.l')
      expect(await db.auditEvent.count({ where: { urlId: idle.id, action: 'link.auto_archive' } })).toBe(1)
      expect(sent.filter((t) => t === on.email)).toHaveLength(1)
    } finally {
      await db.auditEvent.deleteMany({ where: { urlId: { in: [idle.id, fresh.id, active.id, other.id] } } })
      await db.clickEvent.deleteMany({ where: { urlId: active.id } })
      await db.url.deleteMany({ where: { id: { in: [idle.id, fresh.id, active.id, other.id] } } })
      await db.user.deleteMany({ where: { id: { in: [on.id, off.id] } } })
      await db.$disconnect()
    }
  }, 60_000)
})
