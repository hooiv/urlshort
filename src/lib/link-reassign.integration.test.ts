import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: link reassign', () => {
  it.skipIf(!databaseUrl)('moves ownership, previews, enforces target role', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { reassignLinks, ReassignError } = await import('./link-reassign')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const [leaver, editor, viewer, outsider] = await Promise.all(['l', 'e', 'v', 'o'].map((r) => db.user.create({ data: { email: `${r}-${tag}@example.com`, password: 'x' } })))
    const ws = await db.workspace.create({ data: { name: `r${tag}`, slug: `r-${tag}`, members: { create: [{ userId: leaver.id, role: 'editor' }, { userId: editor.id, role: 'editor' }, { userId: viewer.id, role: 'viewer' }] } } })
    try {
      const mk = (n: string, extra: object = {}) => db.url.create({ data: { shortCode: `ra${n}${tag}`.slice(0, 40), originalUrl: 'https://example.com', workspaceId: ws.id, userId: leaver.id, ...extra } })
      const [a, , c] = await Promise.all([mk('1'), mk('2'), mk('3', { deletedAt: new Date() })])
      const other = await db.url.create({ data: { shortCode: `rb${tag}`.slice(0, 40), originalUrl: 'https://example.com', userId: leaver.id } })

      const preview = await reassignLinks(ws.id, { fromUserId: leaver.id, toUserId: editor.id, dryRun: true })
      expect(preview).toMatchObject({ dryRun: true, matched: 2, trashed: 1, reassigned: 0 })
      expect((await db.url.findUnique({ where: { id: a.id } }))?.userId).toBe(leaver.id)

      await expect(reassignLinks(ws.id, { fromUserId: leaver.id, toUserId: viewer.id, confirm: true })).rejects.toBeInstanceOf(ReassignError)
      await expect(reassignLinks(ws.id, { fromUserId: leaver.id, toUserId: outsider.id, confirm: true })).rejects.toMatchObject({ status: 404 })
      await expect(reassignLinks(ws.id, { fromUserId: leaver.id, toUserId: editor.id })).rejects.toMatchObject({ status: 400 })

      const done = await reassignLinks(ws.id, { fromUserId: leaver.id, toUserId: editor.id, confirm: true })
      expect(done.reassigned).toBe(3)
      expect((await db.url.findUnique({ where: { id: c.id } }))?.userId).toBe(editor.id)
      // personal link outside the workspace is untouched
      expect((await db.url.findUnique({ where: { id: other.id } }))?.userId).toBe(leaver.id)
    } finally {
      await db.url.deleteMany({ where: { OR: [{ workspaceId: ws.id }, { shortCode: `rb${tag}`.slice(0, 40) }] } })
      await db.workspace.deleteMany({ where: { id: ws.id } })
      await db.user.deleteMany({ where: { id: { in: [leaver.id, editor.id, viewer.id, outsider.id] } } })
      await db.$disconnect()
    }
  }, 30_000)
})
