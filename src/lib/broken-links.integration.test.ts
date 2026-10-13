import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: broken links', () => {
  it.skipIf(!databaseUrl)('lists down/degraded active links, worst first, with recent traffic', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { getBrokenLinks } = await import('./broken-links')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const ws = await db.workspace.create({ data: { name: tag, slug: `br-${tag}` } })
    const now = new Date()
    try {
      const mk = (code: string, extra: object) => db.url.create({ data: { shortCode: `${code}${tag}`.slice(0, 40), originalUrl: 'https://example.com', workspaceId: ws.id, ...extra } })
      const down = await mk('dn', { healthStatus: 'down', healthConsecutiveFailures: 5, healthStatusCode: 500 })
      const degraded = await mk('dg', { healthStatus: 'degraded', healthConsecutiveFailures: 9 })
      const healthy = await mk('ok', { healthStatus: 'healthy' })
      const archivedDown = await mk('ar', { healthStatus: 'down', isActive: false })
      await db.clickEvent.createMany({ data: [
        { urlId: down.id, trafficType: 'human', createdAt: new Date(now.getTime() - 86_400_000) },
        { urlId: down.id, trafficType: 'bot', createdAt: now },
        { urlId: down.id, trafficType: 'human', createdAt: new Date(now.getTime() - 20 * 86_400_000) },
      ] })
      const scope = { kind: 'workspace' as const, workspaceId: ws.id }
      const res = await getBrokenLinks(scope, { statuses: ['down', 'degraded'], limit: 10 }, now)
      expect(res.links.map((l) => l.id)).toEqual([down.id, degraded.id])
      expect(res.links[0]).toMatchObject({ status: 'down', statusCode: 500, clicksLast7d: 1 })
      expect(res.links.map((l) => l.id)).not.toContain(healthy.id)
      expect(res.links.map((l) => l.id)).not.toContain(archivedDown.id)
      const only = await getBrokenLinks(scope, { statuses: ['degraded'], limit: 10 }, now)
      expect(only.links.map((l) => l.id)).toEqual([degraded.id])
      const lim = await getBrokenLinks(scope, { statuses: ['down', 'degraded'], limit: 1 }, now)
      expect(lim.truncated).toBe(true)
    } finally {
      await db.url.deleteMany({ where: { workspaceId: ws.id } })
      await db.workspace.deleteMany({ where: { id: ws.id } })
      await db.$disconnect()
    }
  }, 60_000)
})
