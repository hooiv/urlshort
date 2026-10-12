import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

/** Real-Postgres check: dimension rollups drive the analytics breakdowns. Opt-in via SOAK_DATABASE_URL. */
const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: click dimension rollups', () => {
  it.skipIf(!databaseUrl)('accumulates concurrent batches and feeds aggregate breakdowns', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { aggregateDimensions, applyDimensionRollups } = await import('./click-dimensions')
    const { getAggregatedAnalytics } = await import('./aggregate-analytics')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const workspace = await db.workspace.create({ data: { name: tag, slug: `d-${tag}` } })
    try {
      const a = await db.url.create({ data: { shortCode: `a${tag}`.slice(0, 40), originalUrl: 'https://example.com', workspaceId: workspace.id } })
      const b = await db.url.create({ data: { shortCode: `b${tag}`.slice(0, 40), originalUrl: 'https://example.com', workspaceId: workspace.id } })
      const day = new Date().toISOString().slice(0, 10)
      const batch = (urlId: string, country: string | null, n: number, trafficType = 'human') =>
        Array.from({ length: n }, () => ({ urlId, dateKey: day, country, deviceType: 'mobile', referrerHost: null, trafficType }))
      const persist = (items: ReturnType<typeof batch>) => db.$transaction((tx) => applyDimensionRollups(tx, aggregateDimensions(items)))
      await Promise.all([persist([...batch(a.id, 'US', 3), ...batch(b.id, 'IN', 2)]), persist([...batch(a.id, 'US', 4), ...batch(a.id, null, 1), ...batch(a.id, 'DE', 9, 'bot')])])
      await db.clickDaily.createMany({ data: [{ urlId: a.id, dateKey: day, clicks: 8 }, { urlId: b.id, dateKey: day, clicks: 2 }] })

      const result = await getAggregatedAnalytics({ kind: 'workspace', workspaceId: workspace.id }, { from: day, to: day, days: 1 })
      expect(result.breakdowns.countries).toEqual([{ key: 'US', clicks: 7 }, { key: 'IN', clicks: 2 }, { key: 'unknown', clicks: 1 }])
      expect(result.breakdowns.devices).toEqual([{ key: 'mobile', clicks: 10 }])
      expect(result.breakdowns.referrers).toEqual([{ key: 'unknown', clicks: 10 }])
    } finally {
      await db.workspace.delete({ where: { id: workspace.id } }).catch(() => undefined)
      await db.url.deleteMany({ where: { workspaceId: null, shortCode: { contains: tag } } })
      await db.$disconnect()
    }
  })
})
