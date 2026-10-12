import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: trending links', () => {
  it.skipIf(!databaseUrl)('ranks workspace links by change and excludes bots and other workspaces', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { getTrendingLinks } = await import('./trending-links')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const ws = await db.workspace.create({ data: { name: tag, slug: `tr-${tag}` } })
    const other = await db.workspace.create({ data: { name: `o${tag}`, slug: `tro-${tag}` } })
    try {
      const mk = (code: string, workspaceId: string) => db.url.create({ data: { shortCode: `${code}${tag}`.slice(0, 40), originalUrl: 'https://example.com', workspaceId } })
      const up = await mk('up', ws.id)
      const down = await mk('dn', ws.id)
      const foreign = await mk('fo', other.id)
      const now = new Date('2026-10-13T00:00:00Z')
      const at = (urlId: string, daysAgo: number, trafficType: 'human' | 'bot' = 'human') => ({ urlId, trafficType, createdAt: new Date(now.getTime() - daysAgo * 86_400_000 - 3600_000) })
      const many = (urlId: string, daysAgo: number, n: number, t: 'human' | 'bot' = 'human') => Array.from({ length: n }, () => at(urlId, daysAgo, t))
      await db.clickEvent.createMany({ data: [
        ...many(up.id, 2, 20), ...many(up.id, 10, 5), ...many(up.id, 2, 50, 'bot'),
        ...many(down.id, 2, 3), ...many(down.id, 10, 12),
        ...many(foreign.id, 2, 99),
      ] })
      const rising = await getTrendingLinks({ kind: 'workspace', workspaceId: ws.id }, { days: 7, direction: 'rising', limit: 10 }, now)
      expect(rising.links.map((l) => l.id)).toEqual([up.id])
      expect(rising.links[0]).toMatchObject({ clicks: 20, previousClicks: 5, delta: 15, changePercent: 300 })
      const falling = await getTrendingLinks({ kind: 'workspace', workspaceId: ws.id }, { days: 7, direction: 'falling', limit: 10 }, now)
      expect(falling.links.map((l) => l.id)).toEqual([down.id])
      expect(falling.links[0]).toMatchObject({ clicks: 3, previousClicks: 12, delta: -9 })
    } finally {
      await db.url.deleteMany({ where: { shortCode: { contains: tag } } })
      await db.workspace.deleteMany({ where: { id: { in: [ws.id, other.id] } } })
      await db.$disconnect()
    }
  }, 60_000)
})
