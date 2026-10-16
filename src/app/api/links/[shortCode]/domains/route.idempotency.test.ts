import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({ upsert: vi.fn(), register: vi.fn(), begin: vi.fn(), store: vi.fn(), release: vi.fn() }))
vi.mock('@/lib/authorization', () => ({ getManageableUrl: vi.fn().mockResolvedValue({ url: { id: 'u1' } }) }))
vi.mock('@/lib/request-actor', () => ({ resolveActor: vi.fn().mockResolvedValue({ actor: { userId: 'usr' } }), LINK_WRITE_SCOPES: [] }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn().mockResolvedValue({ allowed: true }), rateLimitHeaders: () => ({}) }))
vi.mock('@/lib/link-cache', () => ({ invalidateDomain: vi.fn() }))
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn() }))
vi.mock('@/lib/domain-registration', () => ({ registerDomain: m.register, DomainOwnershipError: class extends Error {} }))
vi.mock('@/lib/prisma', () => ({ prisma: { domainLink: { upsert: m.upsert } } }))
vi.mock('@/lib/idempotency-route', () => ({ beginRouteIdempotency: m.begin, storeRouteIdempotency: m.store, releaseRouteIdempotency: m.release }))

import { POST } from './route'

const req = () => new NextRequest('http://x/api/links/abc/domains', { method: 'POST', body: JSON.stringify({ host: 'go.example.com' }), headers: { 'idempotency-key': 'key-12345678' } })
const ctx = { params: Promise.resolve({ shortCode: 'abc' }) }

describe('POST domains idempotency', () => {
  beforeEach(() => {
    Object.values(m).forEach((f) => f.mockReset())
    m.upsert.mockResolvedValue({ id: 'l1' })
    m.begin.mockResolvedValue({})
  })
  it('stores the 201 for a verified bind', async () => {
    m.register.mockResolvedValue({ id: 'd1', status: 'verified', verificationToken: 't' })
    expect((await POST(req(), ctx)).status).toBe(201)
    expect(m.store).toHaveBeenCalledTimes(1)
  })
  it('replays without binding', async () => {
    const replay = new Response('{}', { status: 201 })
    m.begin.mockResolvedValue({ replay })
    expect(await POST(req(), ctx)).toBe(replay)
    expect(m.register).not.toHaveBeenCalled()
  })
  it('releases the claim while verification is pending', async () => {
    m.register.mockResolvedValue({ id: 'd1', status: 'pending', verificationToken: 't' })
    expect((await POST(req(), ctx)).status).toBe(200)
    expect(m.release).toHaveBeenCalledTimes(1)
    expect(m.store).not.toHaveBeenCalled()
  })
  it('releases the claim on failure', async () => {
    m.register.mockRejectedValue(new Error('db'))
    expect((await POST(req(), ctx)).status).toBe(400)
    expect(m.release).toHaveBeenCalledTimes(1)
  })
})
