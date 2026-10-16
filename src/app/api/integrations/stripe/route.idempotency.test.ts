import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({ create: vi.fn(), count: vi.fn(), begin: vi.fn(), store: vi.fn(), release: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn().mockResolvedValue({ id: 'u1' }) }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn().mockResolvedValue({ allowed: true }), rateLimitHeaders: () => ({}) }))
vi.mock('@/lib/prisma', () => ({ prisma: { stripeIntegration: { create: m.create, count: m.count } } }))
vi.mock('@/lib/idempotency-route', () => ({ beginRouteIdempotency: m.begin, storeRouteIdempotency: m.store, releaseRouteIdempotency: m.release }))

import { POST } from './route'

const req = () => new NextRequest('http://x/api/integrations/stripe', { method: 'POST', body: JSON.stringify({ name: 'S' }), headers: { 'idempotency-key': 'key-12345678' } })
const row = { id: 'i1', signingSecret: '', livemode: false, lastEventAt: null, name: 'S', isActive: false, goalEventKey: 'purchase', trackRecurring: true, createdAt: new Date(), updatedAt: new Date() }

describe('POST /api/integrations/stripe idempotency', () => {
  beforeEach(() => {
    Object.values(m).forEach((f) => f.mockReset())
    m.count.mockResolvedValue(0)
    m.create.mockResolvedValue(row)
  })
  it('stores the 201', async () => {
    m.begin.mockResolvedValue({})
    expect((await POST(req())).status).toBe(201)
    expect(m.store).toHaveBeenCalledTimes(1)
  })
  it('replays without creating', async () => {
    const replay = new Response('{}', { status: 201 })
    m.begin.mockResolvedValue({ replay })
    expect(await POST(req())).toBe(replay)
    expect(m.create).not.toHaveBeenCalled()
  })
  it('releases the claim when create throws', async () => {
    m.begin.mockResolvedValue({})
    m.create.mockRejectedValue(new Error('db'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await POST(req())).status).toBe(500)
    expect(m.release).toHaveBeenCalledTimes(1)
  })
  it('releases the claim at the integration cap', async () => {
    m.begin.mockResolvedValue({})
    m.count.mockResolvedValue(1000)
    expect((await POST(req())).status).toBe(409)
    expect(m.release).toHaveBeenCalledTimes(1)
  })
})
