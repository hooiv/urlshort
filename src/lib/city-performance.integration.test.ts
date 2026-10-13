import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: city performance', () => {
  it.skipIf(!databaseUrl)('groups by country, counts visitors, excludes bots, honours viewer scope', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { getCityPerformance } = await import('./city-performance')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const ws = await db.workspace.create({ data: { name: tag, slug: `cy-${tag}` } })
    const viewer = await db.user.create({ data: { email: `cy-${tag}@example.com`, password: 'x' } })
    const now = new Date()
    const ago = (d: number) => new Date(now.getTime() - d * 86_400_000)
    try {
      const secret = await db.folder.create({ data: { workspaceId: ws.id, name: 'Secret', restricted: true } })
      const open = await db.url.create({ data: { shortCode: `o${tag}`.slice(0, 40), originalUrl: 'https://example.com', workspaceId: ws.id } })
      const hidden = await db.url.create({ data: { shortCode: `h${tag}`.slice(0, 40), originalUrl: 'https://example.com', workspaceId: ws.id, folderId: secret.id } })
      await db.clickEvent.createMany({ data: [
        { urlId: open.id, trafficType: 'human', city: 'Pune', country: 'IN', visitorIdHash: 'a', createdAt: ago(1) },
        { urlId: open.id, trafficType: 'human', city: ' pune', country: 'in', visitorIdHash: 'a', createdAt: ago(2) },
        { urlId: open.id, trafficType: 'human', city: 'Pune', country: 'IN', visitorIdHash: 'b', createdAt: ago(3) },
        { urlId: open.id, trafficType: 'human', city: 'Pune', country: 'IN', visitorIdHash: 'c', createdAt: ago(10) },
        { urlId: open.id, trafficType: 'bot', city: 'Pune', country: 'IN', createdAt: ago(1) },
        { urlId: open.id, trafficType: 'human', city: null, country: 'IN', createdAt: ago(1) },
        { urlId: hidden.id, trafficType: 'human', city: 'Austin', country: 'US', visitorIdHash: 'd', createdAt: ago(1) },
      ] })
      const admin = await getCityPerformance(ws.id, undefined, 7, now)
      expect(admin.cities.find((c) => c.city.toLowerCase() === 'pune')).toMatchObject({ clicks: 3, visitors: 2, previousClicks: 1, changePct: 200 })
      expect(admin.cities.some((c) => c.city === 'Austin')).toBe(true)
      const limited = await getCityPerformance(ws.id, { userId: viewer.id }, 7, now)
      expect(limited.cities.some((c) => c.city === 'Austin')).toBe(false)
    } finally {
      await db.url.deleteMany({ where: { workspaceId: ws.id } })
      await db.workspace.deleteMany({ where: { id: ws.id } })
      await db.user.deleteMany({ where: { id: viewer.id } })
      await db.$disconnect()
    }
  }, 60_000)
})
