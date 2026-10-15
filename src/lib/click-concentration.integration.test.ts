import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: click concentration', () => {
  it.skipIf(!databaseUrl)('computes shares from human clicks only', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { getClickConcentration } = await import('./click-concentration')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const ws = await db.workspace.create({ data: { name: tag, slug: `cc-${tag}` } })
    const now = new Date()
    const at = new Date(now.getTime() - 3_600_000)
    try {
      const mk = (code: string) => db.url.create({ data: { shortCode: `${code}${tag}`.slice(0, 40), originalUrl: 'https://example.com', workspaceId: ws.id } })
      const big = await mk('big'); const small = await mk('sml'); const bots = await mk('bot')
      const rows = (urlId: string, n: number, trafficType: 'human' | 'bot' = 'human') => Array.from({ length: n }, () => ({ urlId, trafficType, createdAt: at }))
      await db.clickEvent.createMany({ data: [...rows(big.id, 75), ...rows(small.id, 25), ...rows(bots.id, 500, 'bot')] })
      const res = await getClickConcentration({ kind: 'workspace', workspaceId: ws.id }, 30, now)
      expect(res.totalClicks).toBe(100)
      expect(res.linkCount).toBe(2)
      expect(res.topShares[0].share).toBe(0.75)
      expect(res.level).toBe('concentrated')
      expect(res.top[0].id).toBe(big.id)
    } finally {
      await db.clickEvent.deleteMany({ where: { url: { workspaceId: ws.id } } })
      await db.url.deleteMany({ where: { workspaceId: ws.id } })
      await db.workspace.delete({ where: { id: ws.id } })
      await db.$disconnect()
    }
  }, 60_000)
})
