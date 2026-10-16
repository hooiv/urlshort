import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({
  getManageableUrl: vi.fn(), resolveActor: vi.fn(), cloneLink: vi.fn(), findMembership: vi.fn(), getIdem: vi.fn(), storeIdem: vi.fn(async () => ({})),
}))
vi.mock('@/lib/authorization', () => ({ getManageableUrl: m.getManageableUrl }))
vi.mock('@/lib/request-actor', () => ({ LINK_WRITE_SCOPES: ['links:write'], resolveActor: m.resolveActor }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => ({ allowed: true }), rateLimitHeaders: () => ({}) }))
vi.mock('@/lib/link-clone', async (orig) => ({ ...(await orig<typeof import('@/lib/link-clone')>()), cloneLink: m.cloneLink }))
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn(async () => undefined) }))
vi.mock('@/lib/prisma', () => ({ prisma: { membership: { findFirst: m.findMembership } } }))
vi.mock('@/lib/idempotency', () => ({ getIdempotentResponse: m.getIdem, storeIdempotentResponse: m.storeIdem, withIdempotencyCleanup: <T,>(h: T) => h }))

const req = (headers: Record<string, string> = {}) => new NextRequest('http://x/api/links/bulk-clone', { method: 'POST', body: JSON.stringify({ codes: ['aaa', 'bbb'] }), headers })

describe('POST /api/links/bulk-clone idempotency', () => {
  beforeEach(() => {
    Object.values(m).forEach((f) => 'mockReset' in f && f.mockReset())
    m.storeIdem.mockResolvedValue({})
    m.getManageableUrl.mockResolvedValue({ url: { shortCode: 'a' } })
    m.resolveActor.mockResolvedValue({ actor: { userId: 'u' } })
    m.cloneLink.mockResolvedValue({ id: 'n1', shortCode: 'abc123' })
    m.findMembership.mockResolvedValue({ workspaceId: 'w1' })
  })
  it('stores the batch result under the key', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: null })
    const { POST } = await import('./route')
    const res = await POST(req({ 'idempotency-key': 'key-12345678' }))
    expect(res.status).toBe(201)
    expect(m.storeIdem).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'w1', status: 201 }))
    expect(m.getIdem.mock.calls[0][2]).toEqual({ codes: ['aaa', 'bbb'] })
  })
  it('replays without cloning again', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: { responseJson: '{"cloned":2}', responseStatus: 201 } })
    const { POST } = await import('./route')
    const res = await POST(req({ 'idempotency-key': 'key-12345678' }))
    expect(res.headers.get('Idempotent-Replay')).toBe('true')
    expect(m.cloneLink).not.toHaveBeenCalled()
  })
  it('400 on key reuse with a different batch', async () => {
    m.getIdem.mockRejectedValue(new Error('Idempotency-Key was reused with a different request'))
    const { POST } = await import('./route')
    expect((await POST(req({ 'idempotency-key': 'key-12345678' }))).status).toBe(400)
    expect(m.cloneLink).not.toHaveBeenCalled()
  })
  it('works without a key', async () => {
    const { POST } = await import('./route')
    expect((await POST(req())).status).toBe(201)
    expect(m.getIdem).not.toHaveBeenCalled()
  })
})
