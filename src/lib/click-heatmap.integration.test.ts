import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

/** Real-Postgres check: timezone bucketing, bot exclusion, window bounds. Opt-in via SOAK_DATABASE_URL. */
const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: click heatmap', () => {
  it.skipIf(!databaseUrl)('buckets human clicks in the requested timezone', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { getClickHeatmap } = await import('./click-heatmap')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const workspace = await db.workspace.create({ data: { name: tag, slug: `h-${tag}` } })
    try {
      const url = await db.url.create({ data: { shortCode: `h${tag}`.slice(0, 40), originalUrl: 'https://example.com', workspaceId: workspace.id } })
      const now = new Date('2026-10-12T12:00:00Z')
      // Mon 2026-10-12 20:00 UTC = Tue 01:30 in Asia/Kolkata
      const at = (iso: string, trafficType: 'human' | 'bot' = 'human') => ({ urlId: url.id, createdAt: new Date(iso), trafficType })
      await db.clickEvent.createMany({ data: [
        at('2026-10-11T20:00:00Z'), at('2026-10-11T20:10:00Z'), at('2026-10-11T20:20:00Z', 'bot'), at('2026-09-01T20:00:00Z'), at('2026-10-12T13:00:00Z'),
      ] })
      const utc = await getClickHeatmap(url.id, 'UTC', 30, now)
      expect(utc.total).toBe(2)
      expect(utc.grid[0][20]).toBe(2) // Sunday 20:00 UTC
      const ist = await getClickHeatmap(url.id, 'Asia/Kolkata', 30, now)
      expect(ist.grid[1][1]).toBe(2) // Monday 01:30 IST
      expect(ist.peak).toEqual({ day: 1, hour: 1, clicks: 2 })
    } finally {
      await db.workspace.delete({ where: { id: workspace.id } }).catch(() => undefined)
      await db.url.deleteMany({ where: { shortCode: { contains: tag } } })
      await db.$disconnect()
    }
  }, 60_000)
})
