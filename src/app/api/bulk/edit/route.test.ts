import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { resolveActor, applyBulkEdit } = vi.hoisted(() => ({ resolveActor: vi.fn(), applyBulkEdit: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/link-cache', () => ({ invalidateLinks: vi.fn() }))
vi.mock('@/lib/folders', () => ({ folderWriteError: vi.fn(), visibleUrlWhere: vi.fn() }))
vi.mock('@/lib/request-actor', () => ({ LINK_WRITE_SCOPES: ['links:write'], resolveActor }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => ({ allowed: true }) }))
vi.mock('@/lib/webhooks', () => ({ dispatchWebhooksForUrls: vi.fn(async () => ({})) }))
vi.mock('@/lib/bulk-edit', async (orig) => ({ ...(await orig<typeof import('@/lib/bulk-edit')>()), applyBulkEdit }))

const req = (body: unknown) => new NextRequest('http://x/api/bulk/edit', { method: 'PATCH', body: JSON.stringify(body) })

describe('PATCH /api/bulk/edit', () => {
  beforeEach(() => { resolveActor.mockReset(); applyBulkEdit.mockReset() })
  it('requires links:write', async () => {
    resolveActor.mockResolvedValue({ actor: null, status: 403, error: 'needs scope' })
    const { PATCH } = await import('./route')
    expect((await PATCH(req({}))).status).toBe(403)
    expect(resolveActor).toHaveBeenCalledWith(expect.anything(), ['links:write'])
  })
  it('validates the body', async () => {
    resolveActor.mockResolvedValue({ actor: { userId: 'u' } })
    const { PATCH } = await import('./route')
    expect((await PATCH(req({ links: ['a'], changes: {} }))).status).toBe(400)
  })
  it('returns failures and status from the library', async () => {
    resolveActor.mockResolvedValue({ actor: { userId: 'u' } })
    applyBulkEdit.mockResolvedValue({ ok: false, status: 404, error: '1 link(s) not found', failures: [{ link: 'z', reason: 'Link not found' }] })
    const { PATCH } = await import('./route')
    const res = await PATCH(req({ links: ['z'], changes: { archived: true } }))
    expect(res.status).toBe(404)
    expect((await res.json()).failures).toHaveLength(1)
  })
  it('reports counts on success', async () => {
    resolveActor.mockResolvedValue({ actor: { userId: 'u' } })
    applyBulkEdit.mockResolvedValue({ ok: true, updated: [{ id: '1', shortCode: 'a' }], unchanged: 2, audit: [] })
    const { PATCH } = await import('./route')
    const res = await PATCH(req({ links: ['a', 'b', 'c'], changes: { archived: true } }))
    expect(await res.json()).toMatchObject({ updated: 1, unchanged: 2 })
  })
})
