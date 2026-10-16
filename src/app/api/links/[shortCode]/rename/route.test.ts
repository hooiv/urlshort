import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({
  getManageableUrl: vi.fn(), resolveActor: vi.fn(), renameLink: vi.fn(), findMembership: vi.fn(), getIdem: vi.fn(), storeIdem: vi.fn(async () => ({})), releaseIdem: vi.fn(async () => ({})),
}))
vi.mock('@/lib/authorization', () => ({ getManageableUrl: m.getManageableUrl }))
vi.mock('@/lib/request-actor', () => ({ LINK_WRITE_SCOPES: ['links:write'], resolveActor: m.resolveActor }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => ({ allowed: true }), rateLimitHeaders: () => ({}) }))
vi.mock('@/lib/link-rename', async (orig) => ({ ...(await orig<typeof import('@/lib/link-rename')>()), renameLink: m.renameLink }))
vi.mock('@/lib/link-cache', () => ({ invalidateLink: vi.fn(async () => undefined) }))
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn(async () => undefined) }))
vi.mock('@/lib/prisma', () => ({ prisma: { membership: { findFirst: m.findMembership } } }))
vi.mock('@/lib/idempotency', () => ({ getIdempotentResponse: m.getIdem, storeIdempotentResponse: m.storeIdem, releaseIdempotencyClaim: m.releaseIdem }))

const ctx = { params: Promise.resolve({ shortCode: 'old-code' }) }
const req = (headers: Record<string, string> = {}) =>
  new NextRequest('http://x/api/links/old-code/rename', { method: 'POST', body: JSON.stringify({ newShortCode: 'new-code', confirm: true }), headers })

describe('POST /api/links/:code/rename idempotency', () => {
  beforeEach(() => {
    Object.values(m).forEach((f) => 'mockReset' in f && f.mockReset())
    m.storeIdem.mockResolvedValue({})
    m.getManageableUrl.mockResolvedValue({ url: { id: 'u1', shortCode: 'old-code' } })
    m.resolveActor.mockResolvedValue({ actor: { userId: 'u' } })
    m.renameLink.mockResolvedValue({ id: 'u1', shortCode: 'new-code' })
    m.findMembership.mockResolvedValue({ workspaceId: 'w1' })
  })
  it('stores the response when a key is sent', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: null })
    const { POST } = await import('./route')
    const res = await POST(req({ 'idempotency-key': 'key-12345678' }), ctx)
    expect(res.status).toBe(200)
    expect(m.storeIdem).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'w1', status: 200 }))
  })
  it('replays a retried rename instead of failing on the already-renamed link', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: { responseJson: '{"shortCode":"new-code"}', responseStatus: 200 } })
    const { POST } = await import('./route')
    const res = await POST(req({ 'idempotency-key': 'key-12345678' }), ctx)
    expect(res.headers.get('Idempotent-Replay')).toBe('true')
    expect(m.renameLink).not.toHaveBeenCalled()
  })
  it('rejects key reuse with a different request', async () => {
    m.getIdem.mockRejectedValue(new Error('Idempotency-Key was reused with a different request'))
    const { POST } = await import('./route')
    expect((await POST(req({ 'idempotency-key': 'key-12345678' }), ctx)).status).toBe(400)
  })
  it('releases the claim when the rename fails', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: null })
    m.renameLink.mockRejectedValue(new Error('db down'))
    const { POST } = await import('./route')
    expect((await POST(req({ 'idempotency-key': 'key-12345678' }), ctx)).status).toBe(500)
    expect(m.releaseIdem).toHaveBeenCalledWith('w1', 'h')
  })
  it('works without a key', async () => {
    const { POST } = await import('./route')
    expect((await POST(req(), ctx)).status).toBe(200)
    expect(m.getIdem).not.toHaveBeenCalled()
  })
})
