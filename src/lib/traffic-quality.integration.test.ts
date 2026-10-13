import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: traffic quality', () => {
  it.skipIf(!databaseUrl)('splits human, bot and AI traffic and flags bot-heavy links', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { getTrafficQuality } = await import('./traffic-quality')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const workspace = await db.workspace.create({ data: { name: tag, slug: `tq-${tag}` } })
    try {
      const url = await db.url.create({ data: { shortCode: `tq${tag}`.slice(0, 40), originalUrl: 'https://example.com', workspaceId: workspace.id } })
      const now = new Date('2026-10-12T12:00:00Z')
      const at = (trafficType: 'human' | 'bot' | 'ai_agent', aiAgent: string | null = null, iso = '2026-10-11T10:00:00Z') => ({ urlId: url.id, trafficType, aiAgent, createdAt: new Date(iso) })
      await db.clickEvent.createMany({ data: [
        ...Array.from({ length: 10 }, () => at('human')),
        ...Array.from({ length: 8 }, () => at('bot')),
        ...Array.from({ length: 4 }, () => at('ai_agent', 'GPTBot')),
        at('bot', null, '2026-06-01T10:00:00Z'),
      ] })
      const r = await getTrafficQuality({ kind: 'workspace', workspaceId: workspace.id }, 7, now)
      expect(r.totals).toMatchObject({ human: 10, bot: 8, ai_agent: 4, total: 22 })
      expect(r.aiAgents).toEqual([{ agent: 'GPTBot', clicks: 4 }])
      expect(r.suspiciousLinks).toHaveLength(1)
      expect(r.suspiciousLinks[0].nonHumanPercent).toBe(54.5)
      expect(r.daily).toEqual([{ day: '2026-10-11', human: 10, nonHuman: 12 }])
    } finally {
      await db.url.deleteMany({ where: { shortCode: { contains: tag } } })
      await db.workspace.delete({ where: { id: workspace.id } }).catch(() => undefined)
      await db.$disconnect()
    }
  }, 60_000)
})
