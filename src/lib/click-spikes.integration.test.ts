import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: click spikes', () => {
  it.skipIf(!databaseUrl)('flags a surging link, skips steady, bot-only and small ones', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { getClickSpikes } = await import('./click-spikes')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const ws = await db.workspace.create({ data: { name: tag, slug: `sp-${tag}` } })
    const now = new Date('2026-10-15T12:00:00Z')
    const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000)
    try {
      const mk = (code: string) => db.url.create({ data: { shortCode: `${code}${tag}`.slice(0, 40), originalUrl: 'https://example.com', workspaceId: ws.id } })
      const surge = await mk('sur'); const steady = await mk('std'); const bots = await mk('bot'); const tiny = await mk('tin')
      const rows = (urlId: string, n: number, h: number, trafficType: 'human' | 'bot' = 'human') => Array.from({ length: n }, () => ({ urlId, trafficType, createdAt: hoursAgo(h) }))
      await db.clickEvent.createMany({ data: [
        ...rows(surge.id, 50, 2), ...rows(surge.id, 14, 100),
        ...rows(steady.id, 50, 2), ...rows(steady.id, 14 * 40, 100),
        ...rows(bots.id, 80, 2, 'bot'),
        ...rows(tiny.id, 10, 2),
      ] })
      const res = await getClickSpikes({ kind: 'workspace', workspaceId: ws.id }, { windowHours: 24, limit: 10 }, now)
      expect(res.spikes.map((s) => s.id)).toEqual([surge.id])
      expect(res.spikes[0].recentClicks).toBe(50)
      expect(res.spikes[0].severity).toBe('viral')
    } finally {
      await db.clickEvent.deleteMany({ where: { url: { workspaceId: ws.id } } })
      await db.url.deleteMany({ where: { workspaceId: ws.id } })
      await db.workspace.delete({ where: { id: ws.id } })
      await db.$disconnect()
    }
  }, 60_000)
})
