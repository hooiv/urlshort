import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({
  resolveActor: vi.fn(), renameTag: vi.fn(), findMembership: vi.fn(), getIdem: vi.fn(), storeIdem: vi.fn(async () => ({})), releaseIdem: vi.fn(async () => ({})),
}))
vi.mock('@/lib/request-actor', () => ({ LINK_WRITE_SCOPES: ['links:write'], resolveActor: m.resolveActor }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => ({ allowed: true }), rateLimitHeaders: () => ({}) }))
vi.mock('@/lib/tag-manage', async (orig) => ({ ...(await orig<typeof import('@/lib/tag-manage')>()), renameTag: m.renameTag }))
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn(async () => undefined) }))
vi.mock('@/lib/prisma', () => ({ prisma: { membership: { findFirst: m.findMembership } } }))
vi.mock('@/lib/idempotency', () => ({ getIdempotentResponse: m.getIdem, storeIdempotentResponse: m.storeIdem, releaseIdempotencyClaim: m.releaseIdem }))

import { POST } from './route'

const req = (headers: Record<string, string> = {}) =>
  new NextRequest('http://x/api/tags/rename', { method: 'POST', body: JSON.stringify({ from: 'old', to: 'new' }), headers })

describe('POST /api/tags/rename idempotency', () => {
  beforeEach(() => {
    Object.values(m).forEach((f) => f.mockReset())
    m.storeIdem.mockResolvedValue({})
    m.releaseIdem.mockResolvedValue({})
    m.resolveActor.mockResolvedValue({ actor: { userId: 'u' } })
    m.renameTag.mockResolvedValue({ from: 'old', to: 'new', updated: 3 })
    m.findMembership.mockResolvedValue({ workspaceId: 'w1' })
  })
  it('stores the response when a key is sent', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: null })
    const res = await POST(req({ 'idempotency-key': 'key-12345678' }))
    expect(res.status).toBe(200)
    expect(m.storeIdem).toHaveBeenCalledTimes(1)
  })
  it('replays without renaming again', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: { responseJson: '{"updated":3}', responseStatus: 200 } })
    const res = await POST(req({ 'idempotency-key': 'key-12345678' }))
    expect(res.headers.get('Idempotent-Replay')).toBe('true')
    expect(m.renameTag).not.toHaveBeenCalled()
  })
  it('rejects a reused key with a different body', async () => {
    m.getIdem.mockRejectedValue(new Error('Idempotency-Key was reused with a different request'))
    expect((await POST(req({ 'idempotency-key': 'key-12345678' }))).status).toBe(400)
  })
  it('releases the claim when the rename throws', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: null })
    m.renameTag.mockRejectedValue(new Error('boom'))
    expect((await POST(req({ 'idempotency-key': 'key-12345678' }))).status).toBe(500)
    expect(m.releaseIdem).toHaveBeenCalledTimes(1)
  })
  it('works without a key', async () => {
    expect((await POST(req())).status).toBe(200)
    expect(m.getIdem).not.toHaveBeenCalled()
  })
})
