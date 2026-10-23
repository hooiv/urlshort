import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: link move', () => {
  it.skipIf(!databaseUrl)('moves between workspaces, clears folder, enforces roles', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { moveLink, MoveDeniedError } = await import('./link-move')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const [creator, editor, viewer] = await Promise.all(['c', 'e', 'v'].map((r) => db.user.create({ data: { email: `${r}-${tag}@example.com`, password: 'x' } })))
    const a = await db.workspace.create({ data: { name: `a${tag}`, slug: `a-${tag}`, members: { create: [{ userId: creator.id, role: 'owner' }, { userId: editor.id, role: 'editor' }, { userId: viewer.id, role: 'viewer' }] } } })
    const b = await db.workspace.create({ data: { name: `b${tag}`, slug: `b-${tag}`, members: { create: [{ userId: creator.id, role: 'owner' }, { userId: viewer.id, role: 'viewer' }] } } })
    try {
      const folder = await db.folder.create({ data: { workspaceId: a.id, name: 'F' } })
      const url = await db.url.create({ data: { shortCode: `mv${tag}`.slice(0, 40), originalUrl: 'https://example.com', workspaceId: a.id, userId: creator.id, folderId: folder.id } })
      await expect(moveLink(url, viewer.id, b.id)).rejects.toBeInstanceOf(MoveDeniedError)
      await expect(moveLink(url, editor.id, b.id)).rejects.toBeInstanceOf(MoveDeniedError)
      const moved = await moveLink(url, creator.id, b.id)
      expect(moved.workspaceId).toBe(b.id)
      expect((await db.url.findUnique({ where: { id: url.id } }))?.folderId).toBeNull()
      const personal = await moveLink({ ...url, workspaceId: b.id }, creator.id, null)
      expect(personal.workspaceId).toBeNull()
      await expect(moveLink({ ...url, workspaceId: null }, editor.id, a.id)).rejects.toBeInstanceOf(MoveDeniedError)
    } finally {
      await db.url.deleteMany({ where: { shortCode: { endsWith: tag.slice(0, 20) } } })
      await db.workspace.deleteMany({ where: { id: { in: [a.id, b.id] } } })
      await db.user.deleteMany({ where: { id: { in: [creator.id, editor.id, viewer.id] } } })
      await db.$disconnect()
    }
  }, 30_000)
})
