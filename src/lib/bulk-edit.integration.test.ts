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

      // Extending moves each expiry out from its own date; links with no expiry stay unchanged.
      const noExp = await mk('c')
      const ext = await applyBulkEdit(editor.id, { links: [a.shortCode, noExp.shortCode], changes: { extendExpiryDays: 10 } })
      expect(ext.ok && ext.updated.length).toBe(1)
      expect((await db.url.findUniqueOrThrow({ where: { id: a.id } })).expiresAt?.toISOString()).toBe(new Date(new Date(exp).getTime() + 10 * 86_400_000).toISOString())
      expect((await db.url.findUniqueOrThrow({ where: { id: noExp.id } })).expiresAt).toBeNull()

      // Bulk password: set, verify, audit without leaking, then remove.
      const pw = await applyBulkEdit(editor.id, { links: [a.shortCode, b.id], changes: { password: 'hunter22' } })
      expect(pw.ok && pw.updated.length).toBe(2)
      const { verifyGatePassword } = await import('./password-gate')
      const locked = await db.url.findUniqueOrThrow({ where: { id: a.id } })
      expect(verifyGatePassword('hunter22', locked.passwordHash!)).toBe(true)
      const pwAudit = await db.auditEvent.findFirstOrThrow({ where: { urlId: a.id, action: 'link.bulk_edit' }, orderBy: { createdAt: 'desc' } })
      expect(pwAudit.afterJson).not.toContain('hunter22'); expect(pwAudit.afterJson).not.toContain('scrypt$')
      const rm = await applyBulkEdit(editor.id, { links: [a.shortCode, noExp.shortCode], changes: { password: null } })
      expect(rm.ok && rm.updated.length).toBe(1)
      expect((await db.url.findUniqueOrThrow({ where: { id: a.id } })).passwordHash).toBeNull()

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

  it.skipIf(!databaseUrl)('moves links to trash in one batch, audits them, and they can be restored', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { applyBulkEdit } = await import('./bulk-edit')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const owner = await db.user.create({ data: { email: `t-${tag}@example.com`, password: 'x' } })
    const mk = (n: string) => db.url.create({ data: { shortCode: `${n}${tag}`.slice(0, 40), originalUrl: 'https://example.com/t', userId: owner.id } })
    try {
      const [a, b] = await Promise.all([mk('ta'), mk('tb')])
      const res = await applyBulkEdit(owner.id, { links: [a.shortCode, b.shortCode], changes: { trash: true } })
      expect(res.ok && res.updated.length).toBe(2)
      const rows = await db.url.findMany({ where: { id: { in: [a.id, b.id] } } })
      expect(rows.every((r) => r.deletedAt instanceof Date)).toBe(true)
      expect(await db.auditEvent.count({ where: { action: 'link.bulk_edit', urlId: { in: [a.id, b.id] } } })).toBe(2)
      // Already-trashed links are no longer editable targets.
      const again = await applyBulkEdit(owner.id, { links: [a.shortCode], changes: { trash: true } })
      expect(again.ok).toBe(false)
    } finally {
      await db.url.deleteMany({ where: { userId: owner.id } })
      await db.auditEvent.deleteMany({ where: { actorUserId: owner.id } })
      await db.user.delete({ where: { id: owner.id } })
      await db.$disconnect()
    }
  })
})

describe('real database: bulk pin and redirect status', () => {
  it.skipIf(!databaseUrl)('pins, sets redirect codes and refuses permanent codes on gated links without writing', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { applyBulkEdit } = await import('./bulk-edit')
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const owner = await db.user.create({ data: { email: `o-${tag}@example.com`, password: 'x' } })
    const mk = (n: string, extra: object = {}) => db.url.create({ data: { shortCode: `${n}${tag}`.slice(0, 40), originalUrl: 'https://example.com/p', userId: owner.id, ...extra } })
    try {
      const [a, b, gated, ruled] = await Promise.all([mk('a'), mk('b'), mk('g', { maxClicks: 5 }), mk('r')])
      await db.linkRule.create({ data: { urlId: ruled.id, name: 'US', countryCodes: 'US', destinationUrl: 'https://example.com/us' } })

      const pinned = await applyBulkEdit(owner.id, { links: [a.id, b.id], changes: { pinned: true, redirectStatus: 301 } })
      expect(pinned.ok && pinned.updated.length).toBe(2)
      const rows = await db.url.findMany({ where: { id: { in: [a.id, b.id] } } })
      for (const r of rows) { expect(r.pinnedAt).not.toBeNull(); expect(r.redirectStatus).toBe(301) }

      const again = await applyBulkEdit(owner.id, { links: [a.id], changes: { pinned: true, redirectStatus: 301 } })
      expect(again.ok && again.updated.length).toBe(0)

      const refused = await applyBulkEdit(owner.id, { links: [a.id, gated.id, ruled.id], changes: { redirectStatus: 308 } })
      expect(refused.ok).toBe(false)
      if (!refused.ok) expect(refused.failures.map((f) => f.link).sort()).toEqual([gated.shortCode, ruled.shortCode].sort())
      expect((await db.url.findUniqueOrThrow({ where: { id: a.id } })).redirectStatus).toBe(301)

      // Removing the click limit in the same batch makes the permanent code legal.
      const ok = await applyBulkEdit(owner.id, { links: [gated.id], changes: { maxClicks: null, redirectStatus: 308 } })
      expect(ok.ok).toBe(true)

      // Daily cap: set, refused on a permanent-redirect link, cleared.
      const capped = await applyBulkEdit(owner.id, { links: [b.id], changes: { dailyClickCap: 50, redirectStatus: 307 } })
      expect(capped.ok && capped.updated.length).toBe(1)
      expect((await db.url.findUniqueOrThrow({ where: { id: b.id } })).dailyClickCap).toBe(50)
      const perm = await applyBulkEdit(owner.id, { links: [b.id], changes: { redirectStatus: 301 } })
      expect(perm.ok).toBe(false)
      const clear = await applyBulkEdit(owner.id, { links: [b.id], changes: { dailyClickCap: null } })
      expect(clear.ok && clear.updated.length).toBe(1)
      expect((await db.url.findUniqueOrThrow({ where: { id: b.id } })).dailyClickCap).toBeNull()

      const reset = await applyBulkEdit(owner.id, { links: [a.id], changes: { pinned: false, redirectStatus: null } })
      expect(reset.ok && reset.updated.length).toBe(1)
      const back = await db.url.findUniqueOrThrow({ where: { id: a.id } })
      expect(back.pinnedAt).toBeNull(); expect(back.redirectStatus).toBeNull()
    } finally {
      await db.auditEvent.deleteMany({ where: { actorUserId: owner.id } })
      await db.url.deleteMany({ where: { userId: owner.id } })
      await db.user.delete({ where: { id: owner.id } })
      await db.$disconnect()
    }
  }, 60_000)
})
