import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({ create: vi.fn(), getIdem: vi.fn(), storeIdem: vi.fn(), releaseIdem: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { membership: { findFirst: async () => ({ workspaceId: 'ws1' }) }, webhookEndpoint: { create: m.create } } }))
vi.mock('@/lib/request-actor', () => ({ WEBHOOK_SCOPES: [], resolveActor: async () => ({ actor: { userId: 'u1' } }) }))
vi.mock('@/lib/destination-health', () => ({ assertDestinationSafeForStorage: async () => {} }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => ({ allowed: true }), rateLimitHeaders: () => ({}) }))
vi.mock('@/lib/idempotency', () => ({ getIdempotentResponse: m.getIdem, storeIdempotentResponse: m.storeIdem, releaseIdempotencyClaim: m.releaseIdem }))

import { POST } from './route'

const req = (headers: Record<string, string> = {}) => new NextRequest('http://x/api/webhooks', { method: 'POST', body: JSON.stringify({ url: 'https://example.com/h', events: ['link.clicked'] }), headers })
const key = { 'idempotency-key': 'key-12345678' }

describe('POST webhooks idempotency', () => {
  beforeEach(() => {
    Object.values(m).forEach((f) => f.mockReset())
    m.create.mockResolvedValue({ id: 'w1', secret: 'topsecret', url: 'https://example.com/h' })
    m.storeIdem.mockResolvedValue({})
    m.releaseIdem.mockResolvedValue({})
  })
  it('returns the secret once but never stores it', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: null })
    const res = await POST(req(key))
    expect(res.status).toBe(201)
    expect((await res.json()).secret).toBe('topsecret')
    expect(JSON.stringify(m.storeIdem.mock.calls[0][0].body)).not.toContain('topsecret')
  })
  it('replays without creating a second endpoint', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: { responseJson: '{"id":"w1"}', responseStatus: 201 } })
    const res = await POST(req(key))
    expect(res.headers.get('Idempotent-Replay')).toBe('true')
    expect(m.create).not.toHaveBeenCalled()
  })
  it('releases the claim when create fails', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: null })
    m.create.mockRejectedValue(new Error('db'))
    expect((await POST(req(key))).status).toBe(500)
    expect(m.releaseIdem).toHaveBeenCalledTimes(1)
  })
  it('skips idempotency without a key', async () => {
    expect((await POST(req())).status).toBe(201)
    expect(m.getIdem).not.toHaveBeenCalled()
  })
})
