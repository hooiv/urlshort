import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({
  membership: vi.fn(), count: vi.fn(), create: vi.fn(), findFirst: vi.fn(), getIdem: vi.fn(), storeIdem: vi.fn(), releaseIdem: vi.fn(),
}))
vi.mock('@/lib/workspaces', () => ({ getWorkspaceMembership: m.membership, EDIT_ROLES: ['owner', 'admin', 'editor'] }))
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn(async () => undefined) }))
vi.mock('@/lib/prisma', () => ({ prisma: { folder: { count: m.count, create: m.create }, membership: { findFirst: m.findFirst } } }))
vi.mock('@/lib/idempotency', () => ({ getIdempotentResponse: m.getIdem, storeIdempotentResponse: m.storeIdem, releaseIdempotencyClaim: m.releaseIdem }))

import { POST } from './route'

const ctx = { params: Promise.resolve({ workspaceId: 'w1' }) }
const req = (headers: Record<string, string> = {}) => new NextRequest('http://x/api/workspaces/w1/folders', { method: 'POST', body: JSON.stringify({"name":"Launch"}), headers })
const key = { 'idempotency-key': 'key-12345678' }

describe('POST folders idempotency', () => {
  beforeEach(() => {
    Object.values(m).forEach((f) => f.mockReset())
    m.membership.mockResolvedValue({ userId: 'u', role: 'owner' })
    m.findFirst.mockResolvedValue({ workspaceId: 'w1' })
    m.count.mockResolvedValue(0)
    m.create.mockResolvedValue({ id: 'c1', name: 'x' })
    m.storeIdem.mockResolvedValue({})
    m.releaseIdem.mockResolvedValue({})
  })
  it('stores the 201 response when a key is sent', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: null })
    const res = await POST(req(key), ctx)
    expect(res.status).toBe(201)
    expect(m.storeIdem).toHaveBeenCalledTimes(1)
  })
  it('replays without creating a second row', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: { responseJson: '{"id":"c1"}', responseStatus: 201 } })
    const res = await POST(req(key), ctx)
    expect(res.status).toBe(201)
    expect(res.headers.get('Idempotent-Replay')).toBe('true')
    expect(m.create).not.toHaveBeenCalled()
  })
  it('rejects a key reused with a different body', async () => {
    m.getIdem.mockRejectedValue(new Error('Idempotency-Key was reused with a different request'))
    expect((await POST(req(key), ctx)).status).toBe(400)
    expect(m.create).not.toHaveBeenCalled()
  })
  it('releases the claim on a duplicate-name conflict so the key stays retryable', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: null })
    const { Prisma } = await import('@prisma/client')
    m.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }))
    expect((await POST(req(key), ctx)).status).toBe(409)
    expect(m.releaseIdem).toHaveBeenCalledTimes(1)
    expect(m.storeIdem).not.toHaveBeenCalled()
  })
  it('releases the claim when the create throws', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: null })
    m.create.mockRejectedValue(new Error('boom'))
    await expect(POST(req(key), ctx)).rejects.toThrow('boom')
    expect(m.releaseIdem).toHaveBeenCalledTimes(1)
  })
  it('works without a key', async () => {
    expect((await POST(req(), ctx)).status).toBe(201)
    expect(m.getIdem).not.toHaveBeenCalled()
  })
})
