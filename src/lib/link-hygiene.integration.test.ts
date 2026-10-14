import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: link hygiene', () => {
  it.skipIf(!databaseUrl)('counts each attention bucket and ignores trashed links', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { getLinkHygiene } = await import('./link-hygiene')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const ws = await db.workspace.create({ data: { name: tag, slug: `lh-${tag}` } })
    const now = new Date('2026-10-14T10:00:00Z')
    const at = (d: number) => new Date(now.getTime() + d * 86_400_000)
    try {
      const mk = (code: string, extra: object = {}) => db.url.create({ data: { shortCode: `${code}${tag}`.slice(0, 40), originalUrl: 'https://example.com', workspaceId: ws.id, tags: ['x'], ...extra } })
      await mk('down', { healthStatus: 'down' })
      await mk('deg', { healthStatus: 'degraded' })
      await mk('exp', { expiresAt: at(-1) })
      await mk('soon', { expiresAt: at(3) })
      await mk('far', { expiresAt: at(30) })
      await mk('sched', { startsAt: at(2) })
      await mk('lim', { maxClicks: 5, clicks: 5 })
      await mk('risk', { riskStatus: 'review' })
      await mk('untag', { tags: [] })
      await mk('pw', { passwordHash: 'h' })
      await mk('arc', { isActive: false, tags: [] })
      await mk('trash', { deletedAt: at(-1), healthStatus: 'down' })
      const h = await getLinkHygiene({ kind: 'workspace', workspaceId: ws.id }, now)
      expect(h).toMatchObject({ total: 11, active: 10, archived: 1, destinationDown: 1, destinationDegraded: 1, expired: 1, expiringSoon: 1, scheduled: 1, clickLimitReached: 1, flaggedRisky: 1, untagged: 1, passwordProtected: 1 })
    } finally {
      await db.url.deleteMany({ where: { workspaceId: ws.id } })
      await db.workspace.delete({ where: { id: ws.id } })
      await db.$disconnect()
    }
  })
})
