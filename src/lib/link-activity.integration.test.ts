import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: link activity', () => {
  it.skipIf(!databaseUrl)('pages newest-first with stable cursor and filters by action', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { listLinkActivity } = await import('./link-activity')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const user = await db.user.create({ data: { email: `a-${tag}@example.com`, password: 'x' } })
    try {
      const url = await db.url.create({ data: { shortCode: `act${tag}`.slice(0, 40), originalUrl: 'https://example.com', userId: user.id } })
      const same = new Date('2026-10-13T10:00:00Z')
      for (let i = 0; i < 5; i++) {
        await db.auditEvent.create({ data: { action: i % 2 ? 'link.update' : 'link.rename', actorType: 'user', urlId: url.id, createdAt: same, beforeJson: JSON.stringify({ n: i }), afterJson: JSON.stringify({ n: i + 1 }) } })
      }
      const seen: string[] = []
      let cursor: string | null = null
      do {
        const res: Awaited<ReturnType<typeof listLinkActivity>> = await listLinkActivity(url.id, { limit: 2, cursor })
        if ('error' in res) throw new Error(res.error)
        seen.push(...res.items.map((i) => i.id))
        cursor = res.nextCursor
      } while (cursor)
      expect(seen).toHaveLength(5)
      expect(new Set(seen).size).toBe(5)
      const filtered = await listLinkActivity(url.id, { action: 'link.update' })
      if ('error' in filtered) throw new Error(filtered.error)
      expect(filtered.items).toHaveLength(2)
      expect(filtered.items[0].changes[0]).toMatchObject({ field: 'n' })
    } finally {
      await db.auditEvent.deleteMany({ where: { createdAt: new Date('2026-10-13T10:00:00Z'), actorType: 'user', urlId: { startsWith: 'c' }, action: { in: ['link.update', 'link.rename'] }, actorUserId: null } }).catch(() => undefined)
      await db.url.deleteMany({ where: { userId: user.id } })
      await db.user.deleteMany({ where: { id: user.id } })
      await db.$disconnect()
    }
  }, 30_000)
})
