import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

describe('real database: bulk destination rewrite', () => {
  it.skipIf(!databaseUrl)('rewrites hosts atomically, records revisions and audits, refuses unsafe batches without writing', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { applyBulkEdit } = await import('./bulk-edit')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const editor = await db.user.create({ data: { email: `rw-${tag}@example.com`, password: 'x' } })
    const ws = await db.workspace.create({ data: { name: tag, slug: `rw-${tag}`, members: { create: [{ userId: editor.id, role: 'editor' }] } } })
    const mk = (n: string, originalUrl: string) => db.url.create({ data: { shortCode: `${n}${tag}`.slice(0, 40), originalUrl, workspaceId: ws.id } })
    try {
      const [a, b, c] = await Promise.all([mk('a', 'https://old.example.com/p?x=1'), mk('b', 'https://shop.old.example.com/q'), mk('c', 'https://elsewhere.example.org/z')])
      const dry = await applyBulkEdit(editor.id, { links: [a.id, b.id, c.id], dryRun: true, changes: { rewriteDestination: { mode: 'host', from: 'old.example.com', to: 'new.example.com' } } })
      expect(dry.ok && dry.updated.length).toBe(2)
      expect((await db.url.findUniqueOrThrow({ where: { id: a.id } })).originalUrl).toBe('https://old.example.com/p?x=1')

      const res = await applyBulkEdit(editor.id, { links: [a.id, b.id, c.id], changes: { rewriteDestination: { mode: 'host', from: 'old.example.com', to: 'new.example.com' } } })
      expect(res.ok && res.updated.length).toBe(2)
      expect(res.ok && res.unchanged).toBe(1)
      expect((await db.url.findUniqueOrThrow({ where: { id: a.id } })).originalUrl).toBe('https://new.example.com/p?x=1')
      expect((await db.url.findUniqueOrThrow({ where: { id: b.id } })).originalUrl).toBe('https://shop.new.example.com/q')
      expect((await db.url.findUniqueOrThrow({ where: { id: c.id } })).originalUrl).toBe('https://elsewhere.example.org/z')
      expect(await db.destinationRevision.count({ where: { urlId: { in: [a.id, b.id] }, reason: 'Bulk destination rewrite' } })).toBe(2)
      expect(await db.auditEvent.count({ where: { action: 'link.bulk_edit', urlId: { in: [a.id, b.id] } } })).toBe(2)

      // An unsafe result on any link refuses the whole batch.
      const bad = await applyBulkEdit(editor.id, { links: [a.id, c.id], changes: { rewriteDestination: { mode: 'host', from: 'new.example.com', to: '10.0.0.5' } } })
      expect(bad.ok).toBe(false)
      expect((await db.url.findUniqueOrThrow({ where: { id: a.id } })).originalUrl).toBe('https://new.example.com/p?x=1')
    } finally {
      const ids = (await db.url.findMany({ where: { workspaceId: ws.id }, select: { id: true } })).map((u) => u.id)
      await db.auditEvent.deleteMany({ where: { urlId: { in: ids } } }).catch(() => {})
      await db.destinationRevision.deleteMany({ where: { url: { workspaceId: ws.id } } }).catch(() => {})
      await db.url.deleteMany({ where: { workspaceId: ws.id } })
      await db.membership.deleteMany({ where: { workspaceId: ws.id } })
      await db.workspace.delete({ where: { id: ws.id } }).catch(() => {})
      await db.user.delete({ where: { id: editor.id } }).catch(() => {})
      await db.$disconnect()
    }
  }, 30_000)
})
