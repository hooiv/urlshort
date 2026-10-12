import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: public stats', () => {
  it.skipIf(!databaseUrl)('serves only the shared link and dies on rotate/disable', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { enablePublicStats, disablePublicStats, getPublicStats } = await import('./public-stats')
    const { resolveWindow } = await import('./aggregate-analytics')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const mk = (c: string) => db.url.create({ data: { shortCode: `${c}${tag}`.slice(0, 40), originalUrl: 'https://secret.example.com/x', clicks: 7 } })
    const a = await mk('pa'); const b = await mk('pb')
    try {
      const now = new Date('2026-10-13T05:00:00Z')
      const win = resolveWindow({ range: '7d' }, now)
      await db.clickDaily.createMany({ data: [
        { urlId: a.id, dateKey: '2026-10-12', clicks: 4 }, { urlId: a.id, dateKey: '2026-10-05', clicks: 2 }, { urlId: b.id, dateKey: '2026-10-12', clicks: 99 },
      ] })
      await db.clickDimensionDaily.createMany({ data: [
        { urlId: a.id, dateKey: '2026-10-12', dimension: 'country', key: 'US', clicks: 3 },
        { urlId: b.id, dateKey: '2026-10-12', dimension: 'country', key: 'FR', clicks: 50 },
      ] })
      expect(await getPublicStats('qls_' + 'x'.repeat(43), win)).toBeNull()
      const { token } = await enablePublicStats(a.id)
      const stats = await getPublicStats(token, win)
      expect(stats?.link.shortCode).toBe(a.shortCode)
      expect(stats?.totals).toMatchObject({ clicks: 4, previousClicks: 2, changePercent: 100, allTimeClicks: 7 })
      expect(stats?.countries).toEqual([{ key: 'US', clicks: 3 }])
      expect(JSON.stringify(stats)).not.toContain('secret.example.com')
      const rotated = await enablePublicStats(a.id)
      expect(await getPublicStats(token, win)).toBeNull()
      expect(await getPublicStats(rotated.token, win)).not.toBeNull()
      await disablePublicStats(a.id)
      expect(await getPublicStats(rotated.token, win)).toBeNull()
    } finally {
      await db.url.deleteMany({ where: { shortCode: { contains: tag } } })
      await db.$disconnect()
    }
  }, 60_000)
})
