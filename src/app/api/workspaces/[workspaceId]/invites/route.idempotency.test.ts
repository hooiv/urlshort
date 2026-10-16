import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({ role: vi.fn(), member: vi.fn(), upsert: vi.fn(), getIdem: vi.fn(), storeIdem: vi.fn(), releaseIdem: vi.fn(), send: vi.fn(), audit: vi.fn() }))
vi.mock('@/lib/workspaces', () => ({ ADMIN_ROLES: ['owner', 'admin'], requireWorkspaceRole: m.role, createInviteToken: () => 'tok', hashInviteToken: () => 'hash' }))
vi.mock('@/lib/prisma', () => ({ prisma: { membership: { findFirst: m.member }, workspaceInvite: { upsert: m.upsert } } }))
vi.mock('@/lib/idempotency', () => ({ getIdempotentResponse: m.getIdem, storeIdempotentResponse: m.storeIdem, releaseIdempotencyClaim: m.releaseIdem }))
vi.mock('@/lib/email', () => ({ sendEmail: m.send, renderWorkspaceInviteEmail: () => ({}) }))
vi.mock('@/lib/audit', () => ({ recordAudit: m.audit }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => ({ allowed: true }), rateLimitHeaders: () => ({}) }))

import { POST } from './route'

const req = (headers: Record<string, string> = {}) => new NextRequest('http://x/api/workspaces/w1/invites', { method: 'POST', body: JSON.stringify({ email: 'a@b.com', role: 'viewer' }), headers })
const ctx = { params: Promise.resolve({ workspaceId: 'w1' }) }
const key = { 'idempotency-key': 'key-12345678' }

describe('POST invites idempotency', () => {
  beforeEach(() => {
    Object.values(m).forEach((f) => f.mockReset())
    m.role.mockResolvedValue({ membership: { userId: 'u1', role: 'owner', workspace: { name: 'W' } } })
    m.member.mockResolvedValueOnce({ workspaceId: 'w1' }).mockResolvedValue(null)
    m.upsert.mockResolvedValue({ id: 'i1' })
    m.storeIdem.mockResolvedValue({})
    m.releaseIdem.mockResolvedValue({})
  })
  it('stores a token-free response', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: null })
    const res = await POST(req(key), ctx)
    expect(res.status).toBe(201)
    expect((await res.json()).token).toBe('tok')
    expect(JSON.stringify(m.storeIdem.mock.calls[0][0].body)).not.toContain('tok')
  })
  it('replays without a second email or token rotation', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: { responseJson: '{"id":"i1"}', responseStatus: 201 } })
    const res = await POST(req(key), ctx)
    expect(res.headers.get('Idempotent-Replay')).toBe('true')
    expect(m.upsert).not.toHaveBeenCalled()
    expect(m.send).not.toHaveBeenCalled()
  })
  it('releases the claim when the user is already a member', async () => {
    m.member.mockReset()
    m.member.mockResolvedValue({ workspaceId: 'w1' })
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: null })
    expect((await POST(req(key), ctx)).status).toBe(409)
    expect(m.releaseIdem).toHaveBeenCalledTimes(1)
  })
  it('skips idempotency without a key', async () => {
    m.member.mockReset(); m.member.mockResolvedValue(null)
    expect((await POST(req(), ctx)).status).toBe(201)
    expect(m.getIdem).not.toHaveBeenCalled()
  })
})
