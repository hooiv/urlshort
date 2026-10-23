import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

/** Real-Postgres check for the unfiled-links report. Opt-in via SOAK_DATABASE_URL. */
const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: unfiled links', () => {
  it.skipIf(!databaseUrl)('lists only folderless workspace links, busiest first', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { findUnfiledLinks } = await import('./unfiled-links')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const user = await db.user.create({ data: { email: `u-${tag}@example.com`, password: 'x' } })
    const ws = await db.workspace.create({ data: { name: tag, slug: `u-${tag}`, members: { create: [{ userId: user.id, role: 'admin' }] } } })
    const other = await db.workspace.create({ data: { name: `o${tag}`, slug: `o-${tag}`, members: { create: [{ userId: user.id, role: 'admin' }] } } })
    const folder = await db.folder.create({ data: { workspaceId: ws.id, name: 'F' } })
    try {
      const mk = (code: string, extra: Record<string, unknown>) =>
        db.url.create({ data: { shortCode: `${code}${tag}`.slice(0, 40), originalUrl: 'https://example.com', userId: user.id, workspaceId: ws.id, ...extra } })
      const low = await mk('a', { clicks: 1 })
      const high = await mk('b', { clicks: 9 })
      await mk('c', { clicks: 50, folderId: folder.id })
      await db.url.create({ data: { shortCode: `d${tag}`.slice(0, 40), originalUrl: 'https://example.com', userId: user.id, workspaceId: other.id, clicks: 99 } })

      const scope = { kind: 'workspace' as const, workspaceId: ws.id }
      const r = await findUnfiledLinks(scope, 10)
      expect(r.total).toBe(2)
      expect(r.links.map((l) => l.id)).toEqual([high.id, low.id])
      expect((await findUnfiledLinks(scope, 1)).links).toHaveLength(1)
    } finally {
      await db.url.deleteMany({ where: { userId: user.id } })
      await db.folder.deleteMany({ where: { workspaceId: ws.id } })
      await db.workspace.deleteMany({ where: { id: { in: [ws.id, other.id] } } })
      await db.user.deleteMany({ where: { id: user.id } })
      await db.$disconnect()
    }
  }, 60_000)
})
