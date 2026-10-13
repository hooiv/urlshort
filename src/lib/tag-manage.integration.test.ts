import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: tag rename', () => {
  it.skipIf(!databaseUrl)('renames, merges and respects roles and scope', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { renameTag, TagRenameError } = await import('./tag-manage')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const [editor, viewer] = await Promise.all(['e', 'v'].map((r) => db.user.create({ data: { email: `${r}-${tag}@example.com`, password: 'x' } })))
    const ws = await db.workspace.create({ data: { name: tag, slug: `t-${tag}`, members: { create: [{ userId: editor.id, role: 'editor' }, { userId: viewer.id, role: 'viewer' }] } } })
    try {
      const mk = (c: string, tags: string[], deletedAt: Date | null = null) => db.url.create({ data: { shortCode: `${c}${tag}`.slice(0, 40), originalUrl: 'https://example.com', workspaceId: ws.id, tags, deletedAt } })
      const a = await mk('a', ['promo', 'x'])
      const b = await mk('b', ['promo', 'sale'])
      const trashed = await mk('c', ['promo'], new Date())
      const mine = await db.url.create({ data: { shortCode: `m${tag}`.slice(0, 40), originalUrl: 'https://example.com', userId: editor.id, tags: ['promo'] } })

      await expect(renameTag(viewer.id, { from: 'promo', to: 'sale', workspaceId: ws.id })).rejects.toBeInstanceOf(TagRenameError)
      const res = await renameTag(editor.id, { from: 'Promo', to: 'sale', workspaceId: ws.id })
      expect(res.updated).toBe(2)
      expect((await db.url.findUniqueOrThrow({ where: { id: a.id } })).tags).toEqual(['sale', 'x'])
      expect((await db.url.findUniqueOrThrow({ where: { id: b.id } })).tags).toEqual(['sale'])
      expect((await db.url.findUniqueOrThrow({ where: { id: trashed.id } })).tags).toEqual(['promo'])
      expect((await db.url.findUniqueOrThrow({ where: { id: mine.id } })).tags).toEqual(['promo'])
    } finally {
      await db.url.deleteMany({ where: { OR: [{ workspaceId: ws.id }, { userId: editor.id }] } })
      await db.workspace.delete({ where: { id: ws.id } })
      await db.user.deleteMany({ where: { id: { in: [editor.id, viewer.id] } } })
      await db.$disconnect()
    }
  }, 60_000)
})
