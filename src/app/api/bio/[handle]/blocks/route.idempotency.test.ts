import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({ user: vi.fn(), create: vi.fn(), find: vi.fn(), getIdem: vi.fn(), storeIdem: vi.fn(), releaseIdem: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCurrentUser: m.user }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn().mockResolvedValue({ allowed: true }), rateLimitHeaders: () => ({}) }))
vi.mock('@/lib/workspaces', () => ({ requireWorkspaceRole: vi.fn(), EDIT_ROLES: [] }))
vi.mock('@/lib/prisma', () => ({ prisma: { bioProfile: { findUnique: m.find }, bioBlock: { create: m.create }, membership: { findFirst: vi.fn().mockResolvedValue({ workspaceId: 'w1' }) } } }))
vi.mock('@/lib/idempotency', () => ({ getIdempotentResponse: m.getIdem, storeIdempotentResponse: m.storeIdem, releaseIdempotencyClaim: m.releaseIdem }))

import { POST } from './route'

const req = (body: unknown, headers: Record<string, string> = {}) => new NextRequest('http://x/api/bio/ada/blocks', { method: 'POST', body: JSON.stringify(body), headers })
const ctx = { params: Promise.resolve({ handle: 'ada' }) }
const key = { 'idempotency-key': 'key-12345678' }

describe('POST /api/bio/:handle/blocks idempotency', () => {
  beforeEach(() => {
    Object.values(m).forEach((f) => f.mockReset())
    m.user.mockResolvedValue({ id: 'u1' })
    m.find.mockResolvedValue({ id: 'p1', userId: 'u1', _count: { blocks: 2 } })
    m.create.mockResolvedValue({ id: 'b1' })
    m.storeIdem.mockResolvedValue({})
    m.releaseIdem.mockResolvedValue({})
  })
  it('stores the 201 when a key is sent', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: null })
    expect((await POST(req({ type: 'divider' }, key), ctx)).status).toBe(201)
    expect(m.storeIdem).toHaveBeenCalledTimes(1)
  })
  it('replays without creating a second block', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: { responseJson: '{"id":"b1"}', responseStatus: 201 } })
    const res = await POST(req({ type: 'divider' }, key), ctx)
    expect(res.headers.get('Idempotent-Replay')).toBe('true')
    expect(m.create).not.toHaveBeenCalled()
  })
  it('releases the claim at the block limit', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: null })
    m.find.mockResolvedValue({ id: 'p1', userId: 'u1', _count: { blocks: 100 } })
    expect((await POST(req({ type: 'divider' }, key), ctx)).status).toBe(400)
    expect(m.releaseIdem).toHaveBeenCalledTimes(1)
  })
  it('skips idempotency without a key', async () => {
    expect((await POST(req({ type: 'divider' }), ctx)).status).toBe(201)
    expect(m.getIdem).not.toHaveBeenCalled()
  })
})
