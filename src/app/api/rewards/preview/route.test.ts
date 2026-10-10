import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const resolveActor = vi.fn()
vi.mock('@/lib/request-actor', () => ({ LINK_READ_SCOPES: ['links:read'], resolveActor: (...a: unknown[]) => resolveActor(...a) }))
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(async () => ({ allowed: true, limit: 60, remaining: 59, resetAt: Date.now() + 1000 })),
  rateLimitHeaders: () => ({}),
}))

import { POST } from './route'

const req = (body: unknown) =>
  new NextRequest('http://x/api/rewards/preview', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) })

describe('POST /api/rewards/preview', () => {
  beforeEach(() => resolveActor.mockResolvedValue({ actor: { userId: 'u1' } }))

  it('401s without an actor', async () => {
    resolveActor.mockResolvedValue({ actor: null, error: 'Authentication required', status: 401 })
    expect((await POST(req({}))).status).toBe(401)
  })

  it('rejects bad JSON and bad shapes', async () => {
    expect((await POST(req('{'))).status).toBe(400)
    expect((await POST(req({ scopes: [], samples: [] }))).status).toBe(400)
    expect((await POST(req({ scopes: [{}], samples: [{ saleValueCents: -1 }] }))).status).toBe(400)
  })

  it('prices samples using the fallback', async () => {
    const res = await POST(req({ scopes: [{ fallback: { type: 'percent', amount: 1000 } }], samples: [{ saleValueCents: 5000 }] }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.results[0]).toEqual({ cents: 500, ruleId: null, scopeIndex: 0 })
    expect(json.shadowed).toEqual([])
  })

  it('surfaces invalid rules with the scope index', async () => {
    const res = await POST(req({ scopes: [{ rules: 'nope' }], samples: [{ saleValueCents: 100 }] }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('scopes[0].rules')
  })
})
