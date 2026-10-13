import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: creator performance', () => {
  it.skipIf(!databaseUrl)('groups by owner, counts new links and clicks, excludes bots, honours viewer scope', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { getCreatorPerformance } = await import('./creator-performance')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const ws = await db.workspace.create({ data: { name: tag, slug: `cr-${tag}` } })
    const u1 = await db.user.create({ data: { email: `cr1-${tag}@example.com`, name: 'Ada', password: 'x' } })
    const u2 = await db.user.create({ data: { email: `cr2-${tag}@example.com`, password: 'x' } })
    const now = new Date()
    const ago = (d: number) => new Date(now.getTime() - d * 86_400_000)
    try {
      const l1 = await db.url.create({ data: { shortCode: `a${tag}`.slice(0, 40), originalUrl: 'https://example.com', workspaceId: ws.id, userId: u1.id, createdAt: ago(1) } })
      const secret = await db.folder.create({ data: { workspaceId: ws.id, name: 'Secret', restricted: true } })
      const l2 = await db.url.create({ data: { shortCode: `b${tag}`.slice(0, 40), originalUrl: 'https://example.com', workspaceId: ws.id, userId: u1.id, folderId: secret.id, createdAt: ago(40) } })
      const l3 = await db.url.create({ data: { shortCode: `c${tag}`.slice(0, 40), originalUrl: 'https://example.com', workspaceId: ws.id, userId: u2.id, createdAt: ago(2) } })
      await db.clickEvent.createMany({ data: [
        { urlId: l1.id, trafficType: 'human', createdAt: ago(1) },
        { urlId: l2.id, trafficType: 'human', createdAt: ago(2) },
        { urlId: l2.id, trafficType: 'human', createdAt: ago(10) },
        { urlId: l1.id, trafficType: 'bot', createdAt: ago(1) },
        { urlId: l3.id, trafficType: 'human', createdAt: ago(1) },
      ] })
      const admin = await getCreatorPerformance(ws.id, undefined, 7, now)
      expect(admin.creators.find((c) => c.userId === u1.id)).toMatchObject({ name: 'Ada', totalLinks: 2, newLinks: 1, clicks: 2, previousClicks: 1, changePct: 100 })
      expect(admin.creators.find((c) => c.userId === u2.id)).toMatchObject({ totalLinks: 1, clicks: 1 })
      const own = await getCreatorPerformance(ws.id, { userId: u2.id }, 7, now)
      expect(own.creators.find((c) => c.userId === u1.id)).toMatchObject({ totalLinks: 1, clicks: 1 })
    } finally {
      await db.url.deleteMany({ where: { workspaceId: ws.id } })
      await db.workspace.deleteMany({ where: { id: ws.id } })
      await db.user.deleteMany({ where: { id: { in: [u1.id, u2.id] } } })
      await db.$disconnect()
    }
  }, 60_000)
})
