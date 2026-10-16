import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({ manage: vi.fn(), actor: vi.fn(), create: vi.fn(), findFirst: vi.fn(), getIdem: vi.fn(), storeIdem: vi.fn(), releaseIdem: vi.fn() }))
vi.mock('@/lib/authorization', () => ({ getManageableUrl: m.manage }))
vi.mock('@/lib/request-actor', () => ({ resolveActor: m.actor, LINK_WRITE_SCOPES: ['links:write'] }))
vi.mock('@/lib/prisma', () => ({ prisma: { goal: { create: m.create, findMany: vi.fn() }, membership: { findFirst: m.findFirst } } }))
vi.mock('@/lib/idempotency', () => ({ getIdempotentResponse: m.getIdem, storeIdempotentResponse: m.storeIdem, releaseIdempotencyClaim: m.releaseIdem }))

import { POST } from './route'

const ctx = { params: Promise.resolve({ shortCode: 'abc' }) }
const req = (body: unknown, headers: Record<string, string> = {}) => new NextRequest('http://x/api/links/abc/goals', { method: 'POST', body: JSON.stringify(body), headers })
const key = { 'idempotency-key': 'key-12345678' }

describe('POST goals idempotency', () => {
  beforeEach(() => {
    Object.values(m).forEach((f) => f.mockReset())
    m.manage.mockResolvedValue({ url: { id: 'u1' }, error: null, status: 200 })
    m.actor.mockResolvedValue({ actor: { kind: 'session', userId: 'u' } })
    m.findFirst.mockResolvedValue({ workspaceId: 'w1' })
    m.create.mockResolvedValue({ id: 'g1' })
    m.storeIdem.mockResolvedValue({})
    m.releaseIdem.mockResolvedValue({})
  })
  it('stores the 201 response when a key is sent', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: null })
    expect((await POST(req({ name: 'Signup' }, key), ctx))?.status).toBe(201)
    expect(m.storeIdem).toHaveBeenCalledTimes(1)
  })
  it('replays without creating a second goal', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: { responseJson: '{"id":"g1"}', responseStatus: 201 } })
    const res = await POST(req({ name: 'Signup' }, key), ctx)
    expect(res?.headers.get('Idempotent-Replay')).toBe('true')
    expect(m.create).not.toHaveBeenCalled()
  })
  it('releases the claim on a duplicate event key', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: null })
    m.create.mockRejectedValue(new Error('Unique constraint failed'))
    expect((await POST(req({ name: 'Signup' }, key), ctx))?.status).toBe(409)
    expect(m.releaseIdem).toHaveBeenCalledTimes(1)
  })
  it('rejects invalid bodies before claiming', async () => {
    expect((await POST(req({ name: '' }, key), ctx))?.status).toBe(400)
    expect(m.getIdem).not.toHaveBeenCalled()
  })
  it('works without a key', async () => {
    expect((await POST(req({ name: 'Signup' }), ctx))?.status).toBe(201)
    expect(m.getIdem).not.toHaveBeenCalled()
  })
})
