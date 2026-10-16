import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({
  getIdem: vi.fn(), storeIdem: vi.fn(), releaseIdem: vi.fn(),
  user: vi.fn(), ws: vi.fn(), role: vi.fn(), findUrl: vi.fn(), tx: vi.fn(), publish: vi.fn(),
}))
vi.mock('@/lib/idempotency', () => ({ getIdempotentResponse: m.getIdem, storeIdempotentResponse: m.storeIdem, releaseIdempotencyClaim: m.releaseIdem }))
vi.mock('@/lib/auth', () => ({ getCurrentUser: m.user }))
vi.mock('@/lib/workspaces', () => ({ getDefaultWorkspace: m.ws, requireWorkspaceRole: m.role, EDIT_ROLES: [], ANALYTICS_ROLES: [] }))
vi.mock('@/lib/prisma', () => ({ prisma: { url: { findFirst: m.findUrl }, $transaction: m.tx, campaign: { findMany: vi.fn() } } }))
vi.mock('@/lib/routing-config', () => ({ publishWorkspaceRoutingConfig: m.publish }))
vi.mock('@/lib/destination-health', () => ({ assertDestinationSafeForStorage: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn().mockResolvedValue({ allowed: true }), rateLimitHeaders: () => ({}) }))
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn() }))
import { POST } from './route'

const cuid = 'cjld2cjxh0000qzrmn831i7rn'
const body = (weights = [50, 50]) => ({
  name: 'Camp', slug: 'camp-1', primaryUrlId: cuid,
  variants: [
    { name: 'A', destinationUrl: 'https://a.example', weight: weights[0] },
    { name: 'B', destinationUrl: 'https://b.example', weight: weights[1] },
  ],
})
const req = (b: unknown) => new NextRequest('http://x/api/campaigns', { method: 'POST', body: JSON.stringify(b), headers: { 'idempotency-key': 'key-12345678' } })

describe('POST /api/campaigns idempotency claim lifecycle', () => {
  beforeEach(() => {
    Object.values(m).forEach((f) => f.mockReset())
    m.user.mockResolvedValue({ id: 'u' }); m.ws.mockResolvedValue({ id: 'w1' }); m.role.mockResolvedValue({})
    m.getIdem.mockResolvedValue({ keyHash: 'h', requestHash: 'r', existing: null })
    m.releaseIdem.mockResolvedValue(undefined); m.storeIdem.mockResolvedValue(undefined)
  })
  it('releases the claim when weights are invalid so a corrected retry is not locked out', async () => {
    expect((await POST(req(body([70, 20])))).status).toBe(400)
    expect(m.releaseIdem).toHaveBeenCalledWith('w1', 'h')
  })
  it('releases the claim when the entrypoint link is missing', async () => {
    m.findUrl.mockResolvedValue(null)
    expect((await POST(req(body()))).status).toBe(400)
    expect(m.releaseIdem).toHaveBeenCalledTimes(1)
  })
  it('releases the claim when the transaction throws', async () => {
    m.findUrl.mockResolvedValue({ id: cuid, shortCode: 's' })
    m.tx.mockRejectedValue(new Error('db down'))
    expect((await POST(req(body()))).status).toBe(400)
    expect(m.releaseIdem).toHaveBeenCalledTimes(1)
  })
  it('stores and does not release on success', async () => {
    m.findUrl.mockResolvedValue({ id: cuid, shortCode: 's' })
    m.tx.mockResolvedValue({ id: 'c1', name: 'Camp', slug: 'camp-1', variants: [] })
    expect((await POST(req(body()))).status).toBe(201)
    expect(m.storeIdem).toHaveBeenCalledTimes(1)
    expect(m.releaseIdem).not.toHaveBeenCalled()
  })
})
