import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: click lifespan', () => {
  it.skipIf(!databaseUrl)('separates burst from evergreen and skips bots/young links', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { getLinkLifespans } = await import('./click-lifespan')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const ws = await db.workspace.create({ data: { name: tag, slug: `ls-${tag}` } })
    const now = new Date('2026-10-15T12:00:00Z')
    const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000)
    try {
      const mk = (code: string) => db.url.create({ data: { shortCode: `${code}${tag}`.slice(0, 40), originalUrl: 'https://example.com', workspaceId: ws.id } })
      const burst = await mk('bur'); const ever = await mk('evr'); const bots = await mk('bot'); const young = await mk('yng')
      const rows = (urlId: string, n: number, d: number, trafficType: 'human' | 'bot' = 'human') => Array.from({ length: n }, () => ({ urlId, trafficType, createdAt: daysAgo(d) }))
      await db.clickEvent.createMany({ data: [
        ...rows(burst.id, 90, 20), ...rows(burst.id, 10, 3),
        ...rows(ever.id, 10, 30), ...rows(ever.id, 90, 5),
        ...rows(bots.id, 100, 20, 'bot'),
        ...rows(young.id, 100, 2),
      ] })
      const res = await getLinkLifespans({ kind: 'workspace', workspaceId: ws.id }, { limit: 10 }, now)
      expect(res.links.map((l) => l.id)).toEqual([burst.id, ever.id])
      expect(res.links[0]).toMatchObject({ pattern: 'burst', earlyClicks: 90, totalClicks: 100, lastWeekClicks: 10 })
      expect(res.links[1].pattern).toBe('evergreen')
    } finally {
      await db.clickEvent.deleteMany({ where: { url: { workspaceId: ws.id } } })
      await db.url.deleteMany({ where: { workspaceId: ws.id } })
      await db.workspace.delete({ where: { id: ws.id } })
      await db.$disconnect()
    }
  }, 60_000)
})
