import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: visitor retention', () => {
  it.skipIf(!databaseUrl)('splits new and returning visitors', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { getVisitorRetention } = await import('./visitor-retention')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const workspace = await db.workspace.create({ data: { name: tag, slug: `vr-${tag}` } })
    try {
      const url = await db.url.create({ data: { shortCode: `vr${tag}`.slice(0, 40), originalUrl: 'https://example.com', workspaceId: workspace.id } })
      const now = new Date('2026-10-12T12:00:00Z')
      const at = (v: string | null, iso: string, trafficType: 'human' | 'bot' = 'human') => ({ urlId: url.id, visitorIdHash: v, createdAt: new Date(iso), trafficType })
      await db.clickEvent.createMany({ data: [
        at('a', '2026-10-10T10:00:00Z'), at('a', '2026-10-11T10:00:00Z'), // returning: two days in window
        at('b', '2026-10-10T10:00:00Z'), at('b', '2026-10-10T11:00:00Z'), // new: same day
        at('c', '2026-09-01T10:00:00Z'), at('c', '2026-10-11T10:00:00Z'), // returning: seen before window
        at('d', '2026-10-11T10:00:00Z'), at(null, '2026-10-11T10:00:00Z'),
        at('e', '2026-10-11T10:00:00Z', 'bot'),
      ] })
      const r = await getVisitorRetention(url.id, 30, now)
      expect(r).toMatchObject({ uniqueVisitors: 4, returningVisitors: 2, newVisitors: 2, returningRate: 50, anonymousClicks: 1 })
      expect(r.clicksPerVisitor).toBe(1.5)
    } finally {
      await db.url.deleteMany({ where: { shortCode: { contains: tag } } })
      await db.workspace.delete({ where: { id: workspace.id } }).catch(() => undefined)
      await db.$disconnect()
    }
  }, 60_000)
})
