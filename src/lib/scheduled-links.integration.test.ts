import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

/** Real-Postgres check for the scheduled-links report. Opt-in via SOAK_DATABASE_URL. */
const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: scheduled links', () => {
  it.skipIf(!databaseUrl)('lists only future-dated workspace links, soonest first', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { findScheduledLinks } = await import('./scheduled-links')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const user = await db.user.create({ data: { email: `u-${tag}@example.com`, password: 'x' } })
    const ws = await db.workspace.create({ data: { name: tag, slug: `u-${tag}`, members: { create: [{ userId: user.id, role: 'admin' }] } } })
    const other = await db.workspace.create({ data: { name: `o${tag}`, slug: `o-${tag}`, members: { create: [{ userId: user.id, role: 'admin' }] } } })
    try {
      const mk = (code: string, extra: Record<string, unknown>) =>
        db.url.create({ data: { shortCode: `${code}${tag}`.slice(0, 40), originalUrl: 'https://example.com', userId: user.id, workspaceId: ws.id, ...extra } })
      const day = 86_400_000
      const later = await mk('a', { startsAt: new Date(Date.now() + 5 * day) })
      const sooner = await mk('b', { startsAt: new Date(Date.now() + day) })
      await mk('c', { startsAt: new Date(Date.now() - day) })
      await mk('e', {})
      await db.url.create({ data: { shortCode: `d${tag}`.slice(0, 40), originalUrl: 'https://example.com', userId: user.id, workspaceId: other.id, startsAt: new Date(Date.now() + day) } })

      const scope = { kind: 'workspace' as const, workspaceId: ws.id }
      const r = await findScheduledLinks(scope, 10)
      expect(r.total).toBe(2)
      expect(r.links.map((l) => l.id)).toEqual([sooner.id, later.id])
      expect((await findScheduledLinks(scope, 1)).links).toHaveLength(1)
    } finally {
      await db.url.deleteMany({ where: { userId: user.id } })
      await db.workspace.deleteMany({ where: { id: { in: [ws.id, other.id] } } })
      await db.user.deleteMany({ where: { id: user.id } })
      await db.$disconnect()
    }
  }, 60_000)
})
