import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { resolveActor, applyBulkEdit } = vi.hoisted(() => ({ resolveActor: vi.fn(), applyBulkEdit: vi.fn() }))
const { findMembership, getIdem, storeIdem } = vi.hoisted(() => ({ findMembership: vi.fn(), getIdem: vi.fn(), storeIdem: vi.fn(async () => ({})) }))
vi.mock('@/lib/prisma', () => ({ prisma: { membership: { findFirst: findMembership } } }))
vi.mock('@/lib/idempotency', () => ({ getIdempotentResponse: getIdem, storeIdempotentResponse: storeIdem }))
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
    applyBulkEdit.mockResolvedValue({ ok: true, dryRun: false, updated: [{ id: '1', shortCode: 'a' }], unchanged: 2, audit: [] })
    const { PATCH } = await import('./route')
    const res = await PATCH(req({ links: ['a', 'b', 'c'], changes: { archived: true } }))
    expect(await res.json()).toMatchObject({ updated: 1, unchanged: 2 })
  })

  it('dry run returns a diff and skips idempotency and webhooks', async () => {
    resolveActor.mockResolvedValue({ actor: { userId: 'u' } })
    applyBulkEdit.mockResolvedValue({ ok: true, dryRun: true, updated: [{ id: '1', shortCode: 'a' }], unchanged: 1, audit: [{ id: '1', before: { isActive: true }, after: { isActive: false } }] })
    const { PATCH } = await import('./route')
    const res = await PATCH(new NextRequest('http://x/api/bulk/edit', { method: 'PATCH', body: JSON.stringify({ links: ['a', 'b'], dryRun: true, changes: { archived: true } }), headers: { 'idempotency-key': 'key-12345678' } }))
    expect(await res.json()).toEqual({ dryRun: true, wouldUpdate: 1, unchanged: 1, changes: [{ id: '1', shortCode: 'a', before: { isActive: true }, after: { isActive: false } }] })
    expect(getIdem).not.toHaveBeenCalled()
  })

  describe('Idempotency-Key', () => {
    const idemReq = (body: unknown) => new NextRequest('http://x/api/bulk/edit', { method: 'PATCH', body: JSON.stringify(body), headers: { 'idempotency-key': 'key-12345678' } })
    const body = { links: ['a'], changes: { archived: true } }
    beforeEach(() => { findMembership.mockReset(); getIdem.mockReset(); storeIdem.mockClear() })
    it('replays a stored response without re-applying', async () => {
      resolveActor.mockResolvedValue({ actor: { userId: 'u' } })
      findMembership.mockResolvedValue({ workspaceId: 'w' })
      getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: { responseStatus: 200, responseJson: '{"updated":1}' } })
      const { PATCH } = await import('./route')
      const res = await PATCH(idemReq(body))
      expect(res.headers.get('Idempotent-Replay')).toBe('true')
      expect(applyBulkEdit).not.toHaveBeenCalled()
    })
    it('stores the response on first use', async () => {
      resolveActor.mockResolvedValue({ actor: { userId: 'u' } })
      findMembership.mockResolvedValue({ workspaceId: 'w' })
      getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: null })
      applyBulkEdit.mockResolvedValue({ ok: true, dryRun: false, updated: [{ id: '1', shortCode: 'a' }], unchanged: 0, audit: [] })
      const { PATCH } = await import('./route')
      expect((await PATCH(idemReq(body))).status).toBe(200)
      expect(storeIdem).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'w', keyHash: 'h', status: 200 }))
    })
    it('rejects key reuse with a different body', async () => {
      resolveActor.mockResolvedValue({ actor: { userId: 'u' } })
      findMembership.mockResolvedValue({ workspaceId: 'w' })
      getIdem.mockRejectedValue(new Error('Idempotency-Key was reused with a different request'))
      const { PATCH } = await import('./route')
      expect((await PATCH(idemReq(body))).status).toBe(400)
      expect(applyBulkEdit).not.toHaveBeenCalled()
    })
  })
})
