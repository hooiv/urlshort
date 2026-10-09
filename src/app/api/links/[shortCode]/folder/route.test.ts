import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const db = vi.hoisted(() => ({
  membership: { findUnique: vi.fn() },
  folder: { findUnique: vi.fn(), findFirst: vi.fn() },
  url: { updateMany: vi.fn() },
}))
const access = vi.hoisted(() => vi.fn())
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn(async () => ({ id: 'u1' })) }))
vi.mock('@/lib/authorization', () => ({ getManageableUrl: access }))
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn() }))

import { PATCH } from './route'

const move = (folderId: string | null) => PATCH(new NextRequest('https://ql.test/api/links/abc/folder', { method: 'PATCH', body: JSON.stringify({ folderId }) }), { params: Promise.resolve({ shortCode: 'abc' }) })
const folders: Record<string, { restricted: boolean; access: Array<{ role: string }> }> = {
  secret: { restricted: true, access: [{ role: 'editor' }] },
  locked: { restricted: true, access: [] },
  open: { restricted: false, access: [] },
}

describe('PATCH /api/links/:code/folder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.membership.findUnique.mockResolvedValue({ role: 'editor' })
    db.folder.findFirst.mockImplementation(async ({ where }) => folders[where.id] ?? null)
    db.folder.findUnique.mockImplementation(async ({ where }) => folders[where.id] ?? null)
    db.url.updateMany.mockResolvedValue({ count: 1 })
    access.mockResolvedValue({ url: { id: 'l1', workspaceId: 'w1', folderId: null } })
  })

  it('files a link into a folder the editor can write to, guarded on the old folder', async () => {
    expect((await move('open')).status).toBe(200)
    expect(db.url.updateMany).toHaveBeenCalledWith({ where: { id: 'l1', folderId: null }, data: { folderId: 'open' } })
  })

  it('treats restricted folders without a grant as missing', async () => {
    expect((await move('locked')).status).toBe(404)
    expect(db.url.updateMany).not.toHaveBeenCalled()
  })

  it('stops editors widening exposure, but lets admins', async () => {
    access.mockResolvedValue({ url: { id: 'l1', workspaceId: 'w1', folderId: 'secret' } })
    expect((await move(null)).status).toBe(403)
    expect((await move('open')).status).toBe(403)
    db.membership.findUnique.mockResolvedValue({ role: 'admin' })
    expect((await move(null)).status).toBe(200)
  })

  it('reports a concurrent move instead of overwriting it', async () => {
    db.url.updateMany.mockResolvedValue({ count: 0 })
    expect((await move('open')).status).toBe(409)
  })

  it('rejects personal links', async () => {
    access.mockResolvedValue({ url: { id: 'l1', workspaceId: null, folderId: null } })
    expect((await move('open')).status).toBe(400)
  })
})
