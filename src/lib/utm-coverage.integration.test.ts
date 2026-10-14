import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: utm coverage', () => {
  it.skipIf(!databaseUrl)('reports gaps, ignores archived, computes coverage', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { getUtmCoverage } = await import('./utm-coverage')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const ws = await db.workspace.create({ data: { name: tag, slug: `uc-${tag}` } })
    try {
      const mk = (code: string, originalUrl: string, extra: object = {}) => db.url.create({ data: { shortCode: `${code}${tag}`.slice(0, 40), originalUrl, workspaceId: ws.id, ...extra } })
      await mk('ok', 'https://e.test/?utm_source=a&utm_medium=b&utm_campaign=c')
      const part = await mk('part', 'https://e.test/?utm_source=a')
      const none = await mk('none', 'https://e.test/')
      await mk('arc', 'https://e.test/', { isActive: false })
      const res = await getUtmCoverage({ kind: 'workspace', workspaceId: ws.id }, { limit: 10 })
      expect(res.totalLinks).toBe(3)
      expect(res.coveragePercent).toBe(33.3)
      expect(res.links.map((l) => l.id).sort()).toEqual([part.id, none.id].sort())
      const lim = await getUtmCoverage({ kind: 'workspace', workspaceId: ws.id }, { limit: 1 })
      expect(lim.truncated).toBe(true)
    } finally {
      await db.url.deleteMany({ where: { workspaceId: ws.id } })
      await db.workspace.deleteMany({ where: { id: ws.id } })
      await db.$disconnect()
    }
  }, 60_000)
})
