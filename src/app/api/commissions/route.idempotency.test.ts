import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({
  resolveActor: vi.fn(), transition: vi.fn(), getIdem: vi.fn(), storeIdem: vi.fn(), releaseIdem: vi.fn(),
  tx: vi.fn(async (fn: (t: unknown) => unknown) => fn({})),
}))
vi.mock('@/lib/request-actor', () => ({ LINK_READ_SCOPES: ['links:read'], LINK_WRITE_SCOPES: ['links:write'], resolveActor: m.resolveActor }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => ({ allowed: true }), rateLimitHeaders: () => ({}) }))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: m.tx, membership: { findFirst: async () => ({ workspaceId: 'w1' }) } } }))
vi.mock('@/lib/commissions', async (orig) => ({ ...(await orig<typeof import('@/lib/commissions')>()), transitionCommissions: m.transition }))
vi.mock('@/lib/idempotency', () => ({ getIdempotentResponse: m.getIdem, storeIdempotentResponse: m.storeIdem, releaseIdempotencyClaim: m.releaseIdem }))

import { POST } from './route'

const req = (headers: Record<string, string> = {}) =>
  new NextRequest('http://x/api/commissions', { method: 'POST', body: JSON.stringify({ action: 'pay', ids: ['a'], payoutRef: 'p1' }), headers })

describe('POST /api/commissions idempotency', () => {
  beforeEach(() => {
    Object.values(m).forEach((f) => f.mockReset())
    m.tx.mockImplementation(async (fn: (t: unknown) => unknown) => fn({}))
    m.storeIdem.mockResolvedValue({})
    m.releaseIdem.mockResolvedValue({})
    m.resolveActor.mockResolvedValue({ actor: { userId: 'u' } })
    m.transition.mockResolvedValue(1)
  })
  it('stores the response when a key is sent', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: null })
    expect((await POST(req({ 'idempotency-key': 'key-12345678' }))).status).toBe(200)
    expect(m.storeIdem).toHaveBeenCalledTimes(1)
  })
  it('replays without transitioning again', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: { responseJson: '{"changed":1}', responseStatus: 200 } })
    const res = await POST(req({ 'idempotency-key': 'key-12345678' }))
    expect(res.headers.get('Idempotent-Replay')).toBe('true')
    expect(m.transition).not.toHaveBeenCalled()
  })
  it('releases the claim when the transition throws', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: null })
    m.transition.mockRejectedValue(new Error('boom'))
    await expect(POST(req({ 'idempotency-key': 'key-12345678' }))).rejects.toThrow('boom')
    expect(m.releaseIdem).toHaveBeenCalledTimes(1)
  })
  it('works without a key', async () => {
    expect((await POST(req())).status).toBe(200)
    expect(m.getIdem).not.toHaveBeenCalled()
  })
})
