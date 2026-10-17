import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const update = vi.fn()
vi.mock('@/lib/prisma', () => ({ prisma: { webhookEndpoint: { update: (a: unknown) => update(a) }, url: { findMany: vi.fn().mockResolvedValue([]) } } }))
vi.mock('@/lib/request-actor', () => ({
  WEBHOOK_SCOPES: [],
  resolveActor: vi.fn().mockResolvedValue({ actor: { userId: 'u1' } }),
}))
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  rateLimitHeaders: () => ({}),
}))
vi.mock('@/lib/webhook-endpoint-access', () => ({
  findManageableEndpoint: vi.fn().mockResolvedValue({ id: 'e1', workspaceId: null }),
  resolveEndpointFilter: vi.fn(),
}))

import { PATCH } from './route'

const call = (body: unknown) =>
  PATCH(
    new NextRequest('http://localhost/api/webhooks/e1', { method: 'PATCH', body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: 'e1' }) },
  )

describe('PATCH /api/webhooks/:id', () => {
  beforeEach(() => {
    update.mockReset()
    update.mockResolvedValue({ id: 'e1', url: 'https://x.test', isActive: true, events: ['link.clicked'], linkScope: 'all', tagFilter: [], urlIdFilter: [], folderIdFilter: [], workspaceId: null, updatedAt: new Date() })
  })

  it('re-enabling clears the auto-disable markers', async () => {
    const res = await call({ isActive: true })
    expect(res.status).toBe(200)
    expect(update.mock.calls[0][0].data).toMatchObject({ isActive: true, disabledAt: null, disabledReason: null })
  })

  it('pausing does not touch disable markers', async () => {
    await call({ isActive: false })
    expect(update.mock.calls[0][0].data).toEqual({ isActive: false })
  })

  it('rejects non-boolean isActive, empty and unknown-event bodies', async () => {
    expect((await call({ isActive: 'yes' })).status).toBe(400)
    expect((await call({})).status).toBe(400)
    expect((await call({ events: ['bogus'] })).status).toBe(400)
    expect((await call({ tags: ['a'] })).status).toBe(400)
    expect(update).not.toHaveBeenCalled()
  })
})
