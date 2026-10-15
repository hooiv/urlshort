import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: click drops', () => {
  it.skipIf(!databaseUrl)('flags silent and collapsed links, skips healthy, bot-only and small ones', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { getClickDrops } = await import('./click-drops')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const ws = await db.workspace.create({ data: { name: tag, slug: `dr-${tag}` } })
    const now = new Date('2026-10-15T12:00:00Z')
    const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000)
    try {
      const mk = (code: string) => db.url.create({ data: { shortCode: `${code}${tag}`.slice(0, 40), originalUrl: 'https://example.com', workspaceId: ws.id } })
      const silent = await mk('sil'); const healthy = await mk('hea'); const low = await mk('low'); const bots = await mk('bot')
      const rows = (urlId: string, n: number, h: number, trafficType: 'human' | 'bot' = 'human') => Array.from({ length: n }, () => ({ urlId, trafficType, createdAt: hoursAgo(h) }))
      await db.clickEvent.createMany({ data: [
        ...rows(silent.id, 14 * 30, 100),
        ...rows(healthy.id, 14 * 30, 100), ...rows(healthy.id, 30, 2),
        ...rows(low.id, 14 * 5, 100),
        ...rows(bots.id, 14 * 30, 100, 'bot'),
      ] })
      const res = await getClickDrops({ kind: 'workspace', workspaceId: ws.id }, { windowHours: 24, limit: 10 }, now)
      expect(res.drops.map((d) => d.id)).toEqual([silent.id])
      expect(res.drops[0]).toMatchObject({ recentClicks: 0, severity: 'silent' })
    } finally {
      await db.clickEvent.deleteMany({ where: { url: { workspaceId: ws.id } } })
      await db.url.deleteMany({ where: { workspaceId: ws.id } })
      await db.workspace.delete({ where: { id: ws.id } })
      await db.$disconnect()
    }
  }, 60_000)
})
