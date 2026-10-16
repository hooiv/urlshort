import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({ user: vi.fn(), create: vi.fn(), find: vi.fn(), member: vi.fn(), getIdem: vi.fn(), storeIdem: vi.fn(), releaseIdem: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCurrentUser: m.user }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn().mockResolvedValue({ allowed: true }), rateLimitHeaders: () => ({}) }))
vi.mock('@/lib/workspaces', () => ({ requireWorkspaceRole: vi.fn(), EDIT_ROLES: [] }))
vi.mock('@/lib/prisma', () => ({ prisma: { bioProfile: { create: m.create, findUnique: m.find, findMany: vi.fn() }, membership: { findFirst: m.member } } }))
vi.mock('@/lib/idempotency', () => ({ getIdempotentResponse: m.getIdem, storeIdempotentResponse: m.storeIdem, releaseIdempotencyClaim: m.releaseIdem }))

import { POST } from './route'

const req = (body: unknown, headers: Record<string, string> = {}) => new NextRequest('http://x/api/bio', { method: 'POST', body: JSON.stringify(body), headers })
const key = { 'idempotency-key': 'key-12345678' }

describe('POST /api/bio idempotency', () => {
  beforeEach(() => {
    Object.values(m).forEach((f) => f.mockReset())
    m.user.mockResolvedValue({ id: 'u1' })
    m.member.mockResolvedValue({ workspaceId: 'w1' })
    m.find.mockResolvedValue(null)
    m.create.mockResolvedValue({ id: 'b1', handle: 'ada' })
    m.storeIdem.mockResolvedValue({})
    m.releaseIdem.mockResolvedValue({})
  })
  it('stores the 201 when a key is sent', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: null })
    expect((await POST(req({ handle: 'ada' }, key))).status).toBe(201)
    expect(m.storeIdem).toHaveBeenCalledTimes(1)
  })
  it('replays without creating again', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: { responseJson: '{"id":"b1"}', responseStatus: 201 } })
    const res = await POST(req({ handle: 'ada' }, key))
    expect(res.headers.get('Idempotent-Replay')).toBe('true')
    expect(m.create).not.toHaveBeenCalled()
  })
  it('releases the claim when the handle is taken', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: null })
    m.find.mockResolvedValue({ id: 'x' })
    expect((await POST(req({ handle: 'ada' }, key))).status).toBe(409)
    expect(m.releaseIdem).toHaveBeenCalledTimes(1)
  })
  it('releases the claim on a unique race', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: null })
    m.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }))
    expect((await POST(req({ handle: 'ada' }, key))).status).toBe(409)
    expect(m.releaseIdem).toHaveBeenCalledTimes(1)
  })
  it('skips idempotency without a key', async () => {
    expect((await POST(req({ handle: 'ada' }))).status).toBe(201)
    expect(m.getIdem).not.toHaveBeenCalled()
  })
})
