import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  membership: { findMany: vi.fn(), findUnique: vi.fn() },
  url: { findMany: vi.fn() },
  folder: { count: vi.fn() },
}))
vi.mock('./prisma', () => ({ prisma: db }))

import { manageableEndpointWhere, resolveEndpointFilter } from './webhook-endpoint-access'

const ok = (over: object) => ({ ok: true as const, linkScope: 'all' as const, tagFilter: [], shortCodes: [], folderIds: [], ...over })

describe('webhook endpoint access', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lets users manage personal endpoints and workspace endpoints only where they are admin', async () => {
    db.membership.findMany.mockResolvedValue([{ workspaceId: 'ws_1' }])
    expect(await manageableEndpointWhere('u1')).toEqual({ OR: [{ userId: 'u1', workspaceId: null }, { workspaceId: { in: ['ws_1'] } }] })
    expect(db.membership.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'u1', role: { in: ['owner', 'admin'] } } }))
    db.membership.findMany.mockResolvedValue([])
    expect(await manageableEndpointWhere('u1')).toEqual({ OR: [{ userId: 'u1', workspaceId: null }] })
  })

  it('only accepts folders from the endpoint workspace, and never on personal endpoints', async () => {
    expect(await resolveEndpointFilter({ userId: 'u1', workspaceId: null }, ok({ linkScope: 'folders', folderIds: ['f1'] }))).toMatchObject({ ok: false })
    db.folder.count.mockResolvedValue(1)
    expect(await resolveEndpointFilter({ userId: 'u1', workspaceId: 'ws_1' }, ok({ linkScope: 'folders', folderIds: ['f1', 'f_other'] }))).toMatchObject({ ok: false, error: 'Unknown folder in this workspace' })
    db.folder.count.mockResolvedValue(2)
    expect(await resolveEndpointFilter({ userId: 'u1', workspaceId: 'ws_1' }, ok({ linkScope: 'folders', folderIds: ['f1', 'f2'] }))).toEqual({ ok: true, value: { linkScope: 'folders', tagFilter: [], urlIdFilter: [], folderIdFilter: ['f1', 'f2'] } })
  })

  it('resolves short codes within the workspace for workspace endpoints', async () => {
    db.url.findMany.mockResolvedValue([{ id: 'l1', shortCode: 'a' }])
    expect(await resolveEndpointFilter({ userId: 'u1', workspaceId: 'ws_1' }, ok({ linkScope: 'links', shortCodes: ['a', 'b'] }))).toMatchObject({ ok: false })
    expect(db.url.findMany.mock.calls[0][0].where).toMatchObject({ workspaceId: 'ws_1' })
    db.url.findMany.mockResolvedValue([{ id: 'l1', shortCode: 'a' }])
    expect(await resolveEndpointFilter({ userId: 'u1', workspaceId: 'ws_1' }, ok({ linkScope: 'links', shortCodes: ['a'] }))).toMatchObject({ ok: true, value: { urlIdFilter: ['l1'] } })
  })
})
