import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({
  resolveActor: vi.fn(), deleteTag: vi.fn(), findMembership: vi.fn(), getIdem: vi.fn(), storeIdem: vi.fn(async () => ({})), releaseIdem: vi.fn(async () => ({})),
}))
vi.mock('@/lib/request-actor', () => ({ LINK_WRITE_SCOPES: ['links:write'], resolveActor: m.resolveActor }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => ({ allowed: true }), rateLimitHeaders: () => ({}) }))
vi.mock('@/lib/tag-manage', async (orig) => ({ ...(await orig<typeof import('@/lib/tag-manage')>()), deleteTag: m.deleteTag }))
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn(async () => undefined) }))
vi.mock('@/lib/prisma', () => ({ prisma: { membership: { findFirst: m.findMembership } } }))
vi.mock('@/lib/idempotency', () => ({ getIdempotentResponse: m.getIdem, storeIdempotentResponse: m.storeIdem, releaseIdempotencyClaim: m.releaseIdem }))

import { DELETE } from './route'

const req = (headers: Record<string, string> = {}) =>
  new NextRequest('http://x/api/tags', { method: 'DELETE', body: JSON.stringify({ tag: 'old' }), headers })

describe('DELETE /api/tags idempotency', () => {
  beforeEach(() => {
    Object.values(m).forEach((f) => f.mockReset())
    m.storeIdem.mockResolvedValue({})
    m.releaseIdem.mockResolvedValue({})
    m.resolveActor.mockResolvedValue({ actor: { userId: 'u' } })
    m.deleteTag.mockResolvedValue({ tag: 'old', updated: 3 })
    m.findMembership.mockResolvedValue({ workspaceId: 'w1' })
  })
  it('stores the response when a key is sent', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: null })
    const res = await DELETE(req({ 'idempotency-key': 'key-12345678' }))
    expect(res.status).toBe(200)
    expect(m.storeIdem).toHaveBeenCalledTimes(1)
  })
  it('replays without deleting again', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: { responseJson: '{"updated":3}', responseStatus: 200 } })
    const res = await DELETE(req({ 'idempotency-key': 'key-12345678' }))
    expect(res.headers.get('Idempotent-Replay')).toBe('true')
    expect(m.deleteTag).not.toHaveBeenCalled()
  })
  it('rejects a reused key with a different body', async () => {
    m.getIdem.mockRejectedValue(new Error('Idempotency-Key was reused with a different request'))
    expect((await DELETE(req({ 'idempotency-key': 'key-12345678' }))).status).toBe(400)
  })
  it('releases the claim when the delete throws', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: null })
    m.deleteTag.mockRejectedValue(new Error('boom'))
    expect((await DELETE(req({ 'idempotency-key': 'key-12345678' }))).status).toBe(500)
    expect(m.releaseIdem).toHaveBeenCalledTimes(1)
  })
  it('works without a key', async () => {
    expect((await DELETE(req())).status).toBe(200)
    expect(m.getIdem).not.toHaveBeenCalled()
  })
})
