import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({ manage: vi.fn(), create: vi.fn(), findFirst: vi.fn(), getIdem: vi.fn(), storeIdem: vi.fn(), releaseIdem: vi.fn() }))
vi.mock('@/lib/authorization', () => ({ getManageableUrl: m.manage }))
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn() }))
vi.mock('@/lib/link-cache', () => ({ invalidateLink: vi.fn() }))
vi.mock('@/lib/routing-config', () => ({ publishWorkspaceRoutingConfig: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn().mockResolvedValue({ allowed: true }), rateLimitHeaders: () => ({}) }))
vi.mock('@/lib/destination-health', () => ({ assertDestinationSafeForStorage: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { linkRule: { create: m.create, findMany: vi.fn() }, membership: { findFirst: m.findFirst } } }))
vi.mock('@/lib/idempotency', () => ({ getIdempotentResponse: m.getIdem, storeIdempotentResponse: m.storeIdem, releaseIdempotencyClaim: m.releaseIdem }))

import { POST } from './route'

const ctx = { params: Promise.resolve({ shortCode: 'abc' }) }
const body = { name: 'US only', destinationUrl: 'https://example.com/us', countryCodes: ['US'] }
const req = () => new NextRequest('http://x/api/links/abc/rules', { method: 'POST', body: JSON.stringify(body), headers: { 'idempotency-key': 'key-12345678' } })

describe('POST link rules idempotency', () => {
  beforeEach(() => {
    Object.values(m).forEach((f) => f.mockReset())
    m.manage.mockResolvedValue({ url: { id: 'u1', shortCode: 'abc', userId: 'usr', workspaceId: null } })
    m.findFirst.mockResolvedValue({ workspaceId: 'w1' })
    m.create.mockResolvedValue({ id: 'r1', name: 'US only' })
    m.storeIdem.mockResolvedValue({})
    m.releaseIdem.mockResolvedValue({})
  })
  it('stores the 201 response when a key is sent', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: null })
    expect((await POST(req(), ctx)).status).toBe(201)
    expect(m.storeIdem).toHaveBeenCalledTimes(1)
  })
  it('replays without creating a second rule', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: { responseJson: '{"id":"r1"}', responseStatus: 201 } })
    const res = await POST(req(), ctx)
    expect(res.headers.get('Idempotent-Replay')).toBe('true')
    expect(m.create).not.toHaveBeenCalled()
  })
  it('releases the claim when creation fails', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: null })
    m.create.mockRejectedValue(new Error('boom'))
    expect((await POST(req(), ctx)).status).toBe(400)
    expect(m.releaseIdem).toHaveBeenCalledTimes(1)
  })
})
