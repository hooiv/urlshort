import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({
  getManageableUrl: vi.fn(), resolveActor: vi.fn(), cloneLink: vi.fn(), findMembership: vi.fn(), getIdem: vi.fn(), storeIdem: vi.fn(async () => ({})), releaseIdem: vi.fn(async () => ({})),
}))
vi.mock('@/lib/authorization', () => ({ getManageableUrl: m.getManageableUrl }))
vi.mock('@/lib/request-actor', () => ({ LINK_WRITE_SCOPES: ['links:write'], resolveActor: m.resolveActor }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => ({ allowed: true }), rateLimitHeaders: () => ({}) }))
vi.mock('@/lib/link-clone', async (orig) => ({ ...(await orig<typeof import('@/lib/link-clone')>()), cloneLink: m.cloneLink }))
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn(async () => undefined) }))
vi.mock('@/lib/prisma', () => ({ prisma: { membership: { findFirst: m.findMembership } } }))
vi.mock('@/lib/idempotency', () => ({ getIdempotentResponse: m.getIdem, storeIdempotentResponse: m.storeIdem, releaseIdempotencyClaim: m.releaseIdem }))

const ctx = { params: Promise.resolve({ shortCode: 'src' }) }
const req = (headers: Record<string, string> = {}) => new NextRequest('http://x/api/links/src/clone', { method: 'POST', body: '{}', headers })

describe('POST /api/links/:code/clone idempotency', () => {
  beforeEach(() => {
    Object.values(m).forEach((f) => 'mockReset' in f && f.mockReset())
    m.storeIdem.mockResolvedValue({})
    m.getManageableUrl.mockResolvedValue({ url: { shortCode: 'src' } })
    m.resolveActor.mockResolvedValue({ actor: { userId: 'u' } })
    m.cloneLink.mockResolvedValue({ id: 'n1', shortCode: 'abc123', rulesCopied: 0 })
    m.findMembership.mockResolvedValue({ workspaceId: 'w1' })
  })
  it('creates and stores the response when a key is sent', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: null })
    const { POST } = await import('./route')
    const res = await POST(req({ 'idempotency-key': 'key-12345678' }), ctx)
    expect(res.status).toBe(201)
    expect(m.storeIdem).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'w1', status: 201 }))
  })
  it('replays the stored clone without cloning again', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: { responseJson: '{"shortCode":"abc123"}', responseStatus: 201 } })
    const { POST } = await import('./route')
    const res = await POST(req({ 'idempotency-key': 'key-12345678' }), ctx)
    expect(res.headers.get('Idempotent-Replay')).toBe('true')
    expect(m.cloneLink).not.toHaveBeenCalled()
  })
  it('rejects key reuse with a different request', async () => {
    m.getIdem.mockRejectedValue(new Error('Idempotency-Key was reused with a different request'))
    const { POST } = await import('./route')
    expect((await POST(req({ 'idempotency-key': 'key-12345678' }), ctx)).status).toBe(400)
  })
  it('works without a key', async () => {
    const { POST } = await import('./route')
    expect((await POST(req(), ctx)).status).toBe(201)
    expect(m.getIdem).not.toHaveBeenCalled()
  })
  it('releases the claim when the clone fails so a retry is not locked out', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: null })
    m.cloneLink.mockRejectedValue(new Error('db down'))
    const { POST } = await import('./route')
    expect((await POST(req({ 'idempotency-key': 'key-12345678' }), ctx)).status).toBe(500)
    expect(m.releaseIdem).toHaveBeenCalledWith('w1', 'h')
  })
})
