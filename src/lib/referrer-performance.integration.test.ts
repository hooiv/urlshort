import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: referrer performance', () => {
  it.skipIf(!databaseUrl)('groups by country, counts visitors, excludes bots, honours viewer scope', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { getReferrerPerformance } = await import('./referrer-performance')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const ws = await db.workspace.create({ data: { name: tag, slug: `rf-${tag}` } })
    const viewer = await db.user.create({ data: { email: `rf-${tag}@example.com`, password: 'x' } })
    const now = new Date()
    const ago = (d: number) => new Date(now.getTime() - d * 86_400_000)
    try {
      const secret = await db.folder.create({ data: { workspaceId: ws.id, name: 'Secret', restricted: true } })
      const open = await db.url.create({ data: { shortCode: `o${tag}`.slice(0, 40), originalUrl: 'https://example.com', workspaceId: ws.id } })
      const hidden = await db.url.create({ data: { shortCode: `h${tag}`.slice(0, 40), originalUrl: 'https://example.com', workspaceId: ws.id, folderId: secret.id } })
      await db.clickEvent.createMany({ data: [
        { urlId: open.id, trafficType: 'human', referrerHost: 'news.example.com', visitorIdHash: 'a', createdAt: ago(1) },
        { urlId: open.id, trafficType: 'human', referrerHost: 'WWW.News.Example.com', visitorIdHash: 'a', createdAt: ago(2) },
        { urlId: open.id, trafficType: 'human', referrerHost: 'news.example.com', visitorIdHash: 'b', createdAt: ago(3) },
        { urlId: open.id, trafficType: 'human', referrerHost: 'news.example.com', visitorIdHash: 'c', createdAt: ago(10) },
        { urlId: open.id, trafficType: 'bot', referrerHost: 'news.example.com', createdAt: ago(1) },
        { urlId: open.id, trafficType: 'human', referrerHost: null, createdAt: ago(1) },
        { urlId: hidden.id, trafficType: 'human', referrerHost: 'secret.example.org', visitorIdHash: 'd', createdAt: ago(1) },
      ] })
      const admin = await getReferrerPerformance(ws.id, undefined, 7, now)
      expect(admin.referrers.find((c) => c.host === 'news.example.com')).toMatchObject({ clicks: 3, visitors: 2, previousClicks: 1, changePct: 200 })
      expect(admin.referrers.some((c) => c.host === 'secret.example.org')).toBe(true)
      const limited = await getReferrerPerformance(ws.id, { userId: viewer.id }, 7, now)
      expect(limited.referrers.some((c) => c.host === 'secret.example.org')).toBe(false)
    } finally {
      await db.url.deleteMany({ where: { workspaceId: ws.id } })
      await db.workspace.deleteMany({ where: { id: ws.id } })
      await db.user.deleteMany({ where: { id: viewer.id } })
      await db.$disconnect()
    }
  }, 60_000)
})
