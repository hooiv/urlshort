import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: tag performance', () => {
  it.skipIf(!databaseUrl)('counts human clicks per tag across windows, multi-tag links count for each', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { getTagPerformance } = await import('./tag-performance')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const ws = await db.workspace.create({ data: { name: tag, slug: `tp-${tag}` } })
    const now = new Date('2026-10-13T00:00:00Z')
    const ago = (d: number) => new Date(now.getTime() - d * 86_400_000)
    try {
      const mk = (code: string, tags: string[]) => db.url.create({ data: { shortCode: `${code}${tag}`.slice(0, 40), originalUrl: 'https://example.com', workspaceId: ws.id, tags } })
      const a = await mk('a', ['spring', 'email'])
      const b = await mk('b', ['spring'])
      await mk('c', [])
      await db.clickEvent.createMany({ data: [
        { urlId: a.id, trafficType: 'human', createdAt: ago(2) },
        { urlId: a.id, trafficType: 'human', createdAt: ago(3) },
        { urlId: a.id, trafficType: 'bot', createdAt: ago(3) },
        { urlId: b.id, trafficType: 'human', createdAt: ago(4) },
        { urlId: b.id, trafficType: 'human', createdAt: ago(10) },
        { urlId: b.id, trafficType: 'human', createdAt: ago(40) },
      ] })
      const res = await getTagPerformance({ kind: 'workspace', workspaceId: ws.id }, 7, now)
      const spring = res.tags.find((t) => t.tag === 'spring')
      const email = res.tags.find((t) => t.tag === 'email')
      expect(spring).toMatchObject({ links: 2, clicks: 3, previousClicks: 1 })
      expect(email).toMatchObject({ links: 1, clicks: 2, previousClicks: 0, changePct: null })
      expect(res.tags[0].tag).toBe('spring')
    } finally {
      await db.url.deleteMany({ where: { workspaceId: ws.id } })
      await db.workspace.deleteMany({ where: { id: ws.id } })
      await db.$disconnect()
    }
  }, 60_000)
})
