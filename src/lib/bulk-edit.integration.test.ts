import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: bulk edit', () => {
  it.skipIf(!databaseUrl)('applies changes atomically, audits each link and rejects unauthorised batches without writing', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { applyBulkEdit } = await import('./bulk-edit')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const [editor, viewer] = await Promise.all(['e', 'v'].map((r) => db.user.create({ data: { email: `${r}-${tag}@example.com`, password: 'x' } })))
    const ws = await db.workspace.create({ data: { name: tag, slug: `b-${tag}`, members: { create: [{ userId: editor.id, role: 'editor' }, { userId: viewer.id, role: 'viewer' }] } } })
    const folder = await db.folder.create({ data: { workspaceId: ws.id, name: 'F' } })
    const mk = (n: string, extra: object = {}) => db.url.create({ data: { shortCode: `${n}${tag}`.slice(0, 40), originalUrl: 'https://example.com/p', workspaceId: ws.id, tags: ['old'], ...extra } })
    try {
      const [a, b] = await Promise.all([mk('a'), mk('b', { originalUrl: 'https://example.com/q?utm_source=keep' })])
      const exp = new Date(Date.now() + 86_400_000).toISOString()
      const res = await applyBulkEdit(editor.id, { links: [a.shortCode, b.id], changes: { addTags: ['New'], removeTags: ['old'], folderId: folder.id, expiresAt: exp, archived: true, utm: { source: 'News', medium: 'email' } } })
      expect(res.ok).toBe(true)
      const after = await db.url.findMany({ where: { id: { in: [a.id, b.id] } }, orderBy: { shortCode: 'asc' } })
      for (const l of after) {
        expect(l.tags).toEqual(['new']); expect(l.folderId).toBe(folder.id); expect(l.isActive).toBe(false); expect(l.expiresAt?.toISOString()).toBe(exp)
      }
      expect(after[0].originalUrl).toContain('utm_source=news')
      expect(after[1].originalUrl).toContain('utm_source=keep')
      expect(await db.auditEvent.count({ where: { action: 'link.bulk_edit', urlId: { in: [a.id, b.id] } } })).toBe(2)
      expect(await db.destinationRevision.count({ where: { urlId: { in: [a.id, b.id] }, reason: 'Bulk UTM edit' } })).toBe(2)

      // No-op rerun changes nothing.
      const again = await applyBulkEdit(editor.id, { links: [a.shortCode], changes: { addTags: ['new'], archived: true } })
      expect(again.ok && again.updated.length).toBe(0)

      // A viewer is rejected and nothing is written.
      const denied = await applyBulkEdit(viewer.id, { links: [a.shortCode], changes: { addTags: ['zzz'] } })
      expect(denied.ok).toBe(false)
      expect((await db.url.findUniqueOrThrow({ where: { id: a.id } })).tags).toEqual(['new'])

      // One missing link fails the whole batch.
      const missing = await applyBulkEdit(editor.id, { links: [a.shortCode, 'nope-' + tag], changes: { addTags: ['zzz'] } })
      expect(missing.ok).toBe(false)
      expect((await db.url.findUniqueOrThrow({ where: { id: a.id } })).tags).toEqual(['new'])
    } finally {
      await db.auditEvent.deleteMany({ where: { actorUserId: { in: [editor.id, viewer.id] } } })
      await db.url.deleteMany({ where: { workspaceId: ws.id } })
      await db.workspace.delete({ where: { id: ws.id } })
      await db.user.deleteMany({ where: { id: { in: [editor.id, viewer.id] } } })
      await db.$disconnect()
    }
  }, 60_000)
})
