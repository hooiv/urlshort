import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: country performance', () => {
  it.skipIf(!databaseUrl)('groups by country, counts visitors, excludes bots, honours viewer scope', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { getCountryPerformance } = await import('./country-performance')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const ws = await db.workspace.create({ data: { name: tag, slug: `cp-${tag}` } })
    const viewer = await db.user.create({ data: { email: `cp-${tag}@example.com`, password: 'x' } })
    const now = new Date()
    const ago = (d: number) => new Date(now.getTime() - d * 86_400_000)
    try {
      const secret = await db.folder.create({ data: { workspaceId: ws.id, name: 'Secret', restricted: true } })
      const open = await db.url.create({ data: { shortCode: `o${tag}`.slice(0, 40), originalUrl: 'https://example.com', workspaceId: ws.id } })
      const hidden = await db.url.create({ data: { shortCode: `h${tag}`.slice(0, 40), originalUrl: 'https://example.com', workspaceId: ws.id, folderId: secret.id } })
      await db.clickEvent.createMany({ data: [
        { urlId: open.id, trafficType: 'human', country: 'IN', visitorIdHash: 'a', createdAt: ago(1) },
        { urlId: open.id, trafficType: 'human', country: 'in', visitorIdHash: 'a', createdAt: ago(2) },
        { urlId: open.id, trafficType: 'human', country: 'IN', visitorIdHash: 'b', createdAt: ago(3) },
        { urlId: open.id, trafficType: 'human', country: 'IN', visitorIdHash: 'c', createdAt: ago(10) },
        { urlId: open.id, trafficType: 'bot', country: 'IN', createdAt: ago(1) },
        { urlId: open.id, trafficType: 'human', country: null, createdAt: ago(1) },
        { urlId: hidden.id, trafficType: 'human', country: 'US', visitorIdHash: 'd', createdAt: ago(1) },
      ] })
      const admin = await getCountryPerformance(ws.id, undefined, 7, now)
      expect(admin.countries.find((c) => c.country === 'IN')).toMatchObject({ clicks: 3, visitors: 2, previousClicks: 1, changePct: 200 })
      expect(admin.countries.find((c) => c.country === null)?.clicks).toBe(1)
      expect(admin.countries.find((c) => c.country === 'US')?.clicks).toBe(1)
      const limited = await getCountryPerformance(ws.id, { userId: viewer.id }, 7, now)
      expect(limited.countries.some((c) => c.country === 'US')).toBe(false)
    } finally {
      await db.url.deleteMany({ where: { workspaceId: ws.id } })
      await db.workspace.deleteMany({ where: { id: ws.id } })
      await db.user.deleteMany({ where: { id: viewer.id } })
      await db.$disconnect()
    }
  }, 60_000)
})
