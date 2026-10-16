import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({ user: vi.fn(), create: vi.fn(), findFirst: vi.fn(), getIdem: vi.fn(), storeIdem: vi.fn(), releaseIdem: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCurrentUser: m.user }))
vi.mock('@/lib/request-actor', () => ({ resolveActor: vi.fn(), LINK_READ_SCOPES: [] }))
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { workspace: { create: m.create }, membership: { findFirst: m.findFirst, findMany: vi.fn() } } }))
vi.mock('@/lib/idempotency', () => ({ getIdempotentResponse: m.getIdem, storeIdempotentResponse: m.storeIdem, releaseIdempotencyClaim: m.releaseIdem }))

import { POST } from './route'

const req = (body: unknown, headers: Record<string, string> = {}) => new NextRequest('http://x/api/workspaces', { method: 'POST', body: JSON.stringify(body), headers })
const key = { 'idempotency-key': 'key-12345678' }

describe('POST workspaces idempotency', () => {
  beforeEach(() => {
    Object.values(m).forEach((f) => f.mockReset())
    m.user.mockResolvedValue({ id: 'u' })
    m.findFirst.mockResolvedValue({ workspaceId: 'w1' })
    m.create.mockResolvedValue({ id: 'w2', name: 'Acme', slug: 'acme' })
    m.storeIdem.mockResolvedValue({})
    m.releaseIdem.mockResolvedValue({})
  })
  it('stores the 201 response when a key is sent', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: null })
    expect((await POST(req({ name: 'Acme' }, key)))?.status).toBe(201)
    expect(m.storeIdem).toHaveBeenCalledTimes(1)
  })
  it('replays without creating a second workspace', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: { responseJson: '{"role":"owner"}', responseStatus: 201 } })
    const res = await POST(req({ name: 'Acme' }, key))
    expect(res?.headers.get('Idempotent-Replay')).toBe('true')
    expect(m.create).not.toHaveBeenCalled()
  })
  it('releases the claim when creation fails', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: null })
    m.create.mockRejectedValue(new Error('boom'))
    expect((await POST(req({ name: 'Acme' }, key)))?.status).toBe(400)
    expect(m.releaseIdem).toHaveBeenCalledTimes(1)
  })
  it('works without a key', async () => {
    expect((await POST(req({ name: 'Acme' })))?.status).toBe(201)
    expect(m.getIdem).not.toHaveBeenCalled()
  })
})
