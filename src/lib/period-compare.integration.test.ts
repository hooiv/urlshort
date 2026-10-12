import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: period comparison', () => {
  it.skipIf(!databaseUrl)('counts human clicks in both windows and aligns days', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { getPeriodComparison } = await import('./period-compare')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const workspace = await db.workspace.create({ data: { name: tag, slug: `pc-${tag}` } })
    try {
      const url = await db.url.create({ data: { shortCode: `pc${tag}`.slice(0, 40), originalUrl: 'https://example.com', workspaceId: workspace.id } })
      const now = new Date('2026-10-12T12:00:00Z')
      const ago = (hours: number) => new Date(now.getTime() - hours * 3_600_000)
      const click = (hours: number, trafficType: 'human' | 'bot' = 'human') => ({ urlId: url.id, createdAt: ago(hours), trafficType })
      await db.clickEvent.createMany({ data: [
        click(1), click(2), click(30), click(7 * 24 - 1),      // current 7d: 4 (last is day 7 boundary)
        click(7 * 24 + 5), click(13 * 24),                      // previous 7d: 2
        click(3, 'bot'), click(15 * 24),                        // ignored: bot, outside
      ] })
      const r = await getPeriodComparison(url.id, 7, now)
      expect(r.current.clicks).toBe(4)
      expect(r.previous.clicks).toBe(2)
      expect(r.changePercent).toBe(100)
      expect(r.series.reduce((s, p) => s + p.current, 0)).toBe(4)
      expect(r.series[6].current).toBe(2)   // the 1h and 2h clicks land on the last day
    } finally {
      await db.url.deleteMany({ where: { shortCode: { contains: tag } } })
      await db.workspace.delete({ where: { id: workspace.id } }).catch(() => undefined)
      await db.$disconnect()
    }
  }, 60_000)
})
