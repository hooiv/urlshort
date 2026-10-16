import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({
  getIdem: vi.fn(), storeIdem: vi.fn(), releaseIdem: vi.fn(),
  user: vi.fn(), ws: vi.fn(), role: vi.fn(), find: vi.fn(), update: vi.fn(), publish: vi.fn(),
}))
vi.mock('@/lib/idempotency', () => ({ getIdempotentResponse: m.getIdem, storeIdempotentResponse: m.storeIdem, releaseIdempotencyClaim: m.releaseIdem }))
vi.mock('@/lib/auth', () => ({ getCurrentUser: m.user }))
vi.mock('@/lib/workspaces', () => ({ getDefaultWorkspace: m.ws, requireWorkspaceRole: m.role }))
vi.mock('@/lib/prisma', () => ({ prisma: { campaign: { findMany: m.find, updateMany: m.update } } }))
vi.mock('@/lib/routing-config', () => ({ publishWorkspaceRoutingConfig: m.publish }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn().mockResolvedValue({ allowed: true }) }))
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn() }))
import { POST } from './route'

const req = (b: unknown, key = true) => new NextRequest('http://x/api/campaigns/bulk', { method: 'POST', body: JSON.stringify(b), headers: key ? { 'idempotency-key': 'key-12345678' } : {} })

describe('POST /api/campaigns/bulk', () => {
  beforeEach(() => {
    Object.values(m).forEach((f) => f.mockReset())
    m.user.mockResolvedValue({ id: 'u' }); m.ws.mockResolvedValue({ id: 'w1' }); m.role.mockResolvedValue({ membership: {} })
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: null })
    m.releaseIdem.mockResolvedValue(undefined); m.storeIdem.mockResolvedValue(undefined); m.update.mockResolvedValue({ count: 2 })
  })
  it('rejects invalid bodies without claiming a key', async () => {
    expect((await POST(req({ campaignIds: [], action: 'start' }))).status).toBe(400)
    expect(m.getIdem).not.toHaveBeenCalled()
  })
  it('starts campaigns, publishes routing and stores the response', async () => {
    m.find.mockResolvedValue([{ id: 'a', status: 'draft' }, { id: 'b', status: 'paused' }])
    const res = await POST(req({ campaignIds: ['a', 'b', 'a'], action: 'start' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, updated: 2, action: 'start' })
    expect(m.publish).toHaveBeenCalledWith('w1')
    expect(m.storeIdem).toHaveBeenCalledTimes(1)
    expect(m.releaseIdem).not.toHaveBeenCalled()
  })
  it('replays the first result for a retried key instead of 409', async () => {
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: { responseJson: '{"ok":true,"updated":2,"action":"start"}', responseStatus: 200 } })
    const res = await POST(req({ campaignIds: ['a', 'b'], action: 'start' }))
    expect(res.headers.get('Idempotent-Replay')).toBe('true')
    expect(m.find).not.toHaveBeenCalled()
  })
  it('releases the claim on 409 state conflicts and 404', async () => {
    m.find.mockResolvedValue([{ id: 'a', status: 'running' }])
    expect((await POST(req({ campaignIds: ['a'], action: 'start' }))).status).toBe(409)
    m.find.mockResolvedValue([])
    expect((await POST(req({ campaignIds: ['a'], action: 'start' }))).status).toBe(404)
    expect(m.releaseIdem).toHaveBeenCalledTimes(2)
    expect(m.update).not.toHaveBeenCalled()
  })
  it('releases the claim when the update throws', async () => {
    m.find.mockResolvedValue([{ id: 'a', status: 'running' }])
    m.update.mockRejectedValue(new Error('db'))
    expect((await POST(req({ campaignIds: ['a'], action: 'pause' }))).status).toBe(500)
    expect(m.releaseIdem).toHaveBeenCalledTimes(1)
  })
  it('works without an Idempotency-Key', async () => {
    m.find.mockResolvedValue([{ id: 'a', status: 'running' }])
    expect((await POST(req({ campaignIds: ['a'], action: 'pause' }, false))).status).toBe(200)
    expect(m.getIdem).not.toHaveBeenCalled()
  })
})
