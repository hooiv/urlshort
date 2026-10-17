import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: retention cleanup', () => {
  it.skipIf(!databaseUrl)('deletes only expired rows of the workspace policy, in batches', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { cleanupExpiredOperationalData } = await import('./observability')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const ws = await db.workspace.create({ data: { name: tag, slug: `r-${tag}` } })
    const other = await db.workspace.create({ data: { name: `o${tag}`, slug: `ro-${tag}` } })
    try {
      await db.privacyPolicy.create({ data: { workspaceId: ws.id, retentionDays: 30, auditRetentionDays: 10 } })
      const mk = (w: string, c: string) => db.url.create({ data: { shortCode: `${c}${tag}`.slice(0, 40), originalUrl: 'https://example.com', workspaceId: w } })
      const [u, o] = await Promise.all([mk(ws.id, 'a'), mk(other.id, 'b')])
      const old = new Date(Date.now() - 60 * 86400000)
      const fresh = new Date()
      await db.clickEvent.createMany({ data: [
        ...Array.from({ length: 7 }, () => ({ urlId: u.id, createdAt: old })),
        ...Array.from({ length: 3 }, () => ({ urlId: u.id, createdAt: fresh })),
        ...Array.from({ length: 4 }, () => ({ urlId: o.id, createdAt: old })),
      ] })
      await db.auditEvent.createMany({ data: [
        { action: 'x', actorType: 'user', urlId: u.id, createdAt: old },
        { action: 'x', actorType: 'user', urlId: u.id, createdAt: fresh },
      ] })
      const r = await cleanupExpiredOperationalData()
      expect(r.clickEvents).toBeGreaterThanOrEqual(7)
      expect(await db.clickEvent.count({ where: { urlId: u.id } })).toBe(3)
      expect(await db.clickEvent.count({ where: { urlId: o.id } })).toBe(4)
      expect(await db.auditEvent.count({ where: { urlId: u.id } })).toBe(1)
    } finally {
      await db.clickEvent.deleteMany({ where: { urlId: { in: (await db.url.findMany({ where: { workspaceId: { in: [ws.id, other.id] } }, select: { id: true } })).map((x) => x.id) } } })
      await db.workspace.deleteMany({ where: { id: { in: [ws.id, other.id] } } })
      await db.$disconnect()
    }
  })
})
