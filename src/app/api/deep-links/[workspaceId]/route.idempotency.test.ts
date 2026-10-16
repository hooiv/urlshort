import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({ create: vi.fn(), getIdem: vi.fn(), storeIdem: vi.fn(), releaseIdem: vi.fn() }))
vi.mock('@/lib/workspaces', () => ({ requireWorkspaceRole: vi.fn().mockResolvedValue({ membership: { userId: 'u1', role: 'owner' } }) }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn().mockResolvedValue({ allowed: true }) }))
vi.mock('@/lib/prisma', () => ({ prisma: { deepLinkApp: { create: m.create }, membership: { findFirst: vi.fn().mockResolvedValue({ workspaceId: 'w1' }) } } }))
vi.mock('@/lib/idempotency', () => ({ getIdempotentResponse: m.getIdem, storeIdempotentResponse: m.storeIdem, releaseIdempotencyClaim: m.releaseIdem }))

import { POST } from './route'

const req = (body: unknown, headers: Record<string, string> = {}) => new NextRequest('http://x/api/deep-links/w1', { method: 'POST', body: JSON.stringify(body), headers })
const ctx = { params: Promise.resolve({ workspaceId: 'w1' }) }
const key = { 'idempotency-key': 'key-12345678' }

describe('POST /api/deep-links/:workspaceId idempotency', () => {
  beforeEach(() => {
    Object.values(m).forEach((f) => f.mockReset())
    m.create.mockResolvedValue({ id: 'a1' })
    m.storeIdem.mockResolvedValue({})
    m.releaseIdem.mockResolvedValue({})
  })
  it('stores the 201 when a key is sent', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: null })
    expect((await POST(req({ name: 'App' }, key), ctx)).status).toBe(201)
    expect(m.storeIdem).toHaveBeenCalledTimes(1)
  })
  it('replays without creating a second app', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: { responseJson: '{"id":"a1"}', responseStatus: 201 } })
    const res = await POST(req({ name: 'App' }, key), ctx)
    expect(res.headers.get('Idempotent-Replay')).toBe('true')
    expect(m.create).not.toHaveBeenCalled()
  })
  it('releases the claim when create fails', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: null })
    m.create.mockRejectedValue(new Error('db'))
    expect((await POST(req({ name: 'App' }, key), ctx)).status).toBe(400)
    expect(m.releaseIdem).toHaveBeenCalledTimes(1)
  })
  it('rejects invalid bodies before claiming a key', async () => {
    expect((await POST(req({}, key), ctx)).status).toBe(400)
    expect(m.getIdem).not.toHaveBeenCalled()
  })
  it('skips idempotency without a key', async () => {
    expect((await POST(req({ name: 'App' }), ctx)).status).toBe(201)
    expect(m.getIdem).not.toHaveBeenCalled()
  })
})
