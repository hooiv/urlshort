import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: bulk edit dry run', () => {
  it.skipIf(!databaseUrl)('returns the diff without writing, auditing, or bypassing validation', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { applyBulkEdit } = await import('./bulk-edit')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const [editor, viewer] = await Promise.all(['e', 'v'].map((r) => db.user.create({ data: { email: `${r}-${tag}@example.com`, password: 'x' } })))
    const ws = await db.workspace.create({ data: { name: tag, slug: `d-${tag}`, members: { create: [{ userId: editor.id, role: 'editor' }, { userId: viewer.id, role: 'viewer' }] } } })
    const a = await db.url.create({ data: { shortCode: `a${tag}`.slice(0, 40), originalUrl: 'https://example.com/p', workspaceId: ws.id, tags: ['old'] } })
    try {
      const res = await applyBulkEdit(editor.id, { links: [a.shortCode], dryRun: true, changes: { addTags: ['new'], archived: true } })
      expect(res.ok && res.dryRun).toBe(true)
      expect(res.ok && res.audit[0].after).toMatchObject({ tags: ['old', 'new'], isActive: false })
      const row = await db.url.findUniqueOrThrow({ where: { id: a.id } })
      expect(row.tags).toEqual(['old']); expect(row.isActive).toBe(true)
      expect(await db.auditEvent.count({ where: { urlId: a.id } })).toBe(0)

      const denied = await applyBulkEdit(viewer.id, { links: [a.shortCode], dryRun: true, changes: { archived: true } })
      expect(denied.ok).toBe(false)
    } finally {
      await db.auditEvent.deleteMany({ where: { urlId: a.id } })
      await db.url.deleteMany({ where: { workspaceId: ws.id } })
      await db.workspace.delete({ where: { id: ws.id } })
      await db.user.deleteMany({ where: { id: { in: [editor.id, viewer.id] } } })
      await db.$disconnect()
    }
  })
})
