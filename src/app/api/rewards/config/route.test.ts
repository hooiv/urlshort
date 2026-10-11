import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const resolveActor = vi.fn()
const db = vi.hoisted(() => ({
  rewardConfig: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  url: { findUnique: vi.fn() },
  membership: { findUnique: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/request-actor', () => ({ LINK_READ_SCOPES: ['links:read'], LINK_WRITE_SCOPES: ['links:write'], resolveActor: (...a: unknown[]) => resolveActor(...a) }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(async () => ({ allowed: true })), rateLimitHeaders: () => ({}) }))

import { DELETE, GET, PUT } from './route'

const put = (body: unknown) => new NextRequest('http://x/api/rewards/config', { method: 'PUT', body: JSON.stringify(body) })
const row = { scopeKey: 'account', urlId: null, rules: '[]', fallback: '{"type":"percent","amount":1000}', updatedAt: new Date(0), url: null }

describe('/api/rewards/config', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveActor.mockResolvedValue({ actor: { userId: 'u1' } })
    db.rewardConfig.upsert.mockResolvedValue(row)
  })

  it('requires read scope for GET and write scope for PUT/DELETE', async () => {
    db.rewardConfig.findMany.mockResolvedValue([row])
    await GET(new NextRequest('http://x/api/rewards/config'))
    expect(resolveActor).toHaveBeenLastCalledWith(expect.anything(), ['links:read'])
    await PUT(put({ fallback: { type: 'percent', amount: 1000 } }))
    expect(resolveActor).toHaveBeenLastCalledWith(expect.anything(), ['links:write'])
    db.rewardConfig.deleteMany.mockResolvedValue({ count: 1 })
    await DELETE(new NextRequest('http://x/api/rewards/config', { method: 'DELETE' }))
    expect(resolveActor).toHaveBeenLastCalledWith(expect.anything(), ['links:write'])
  })

  it('401s and 403s from the actor resolver', async () => {
    resolveActor.mockResolvedValue({ actor: null, status: 403, error: 'API key needs one of these scopes: links:write' })
    expect((await PUT(put({}))).status).toBe(403)
    resolveActor.mockResolvedValue({ actor: null, status: 401, error: 'Authentication required' })
    expect((await GET(new NextRequest('http://x/api/rewards/config'))).status).toBe(401)
  })

  it('validates rules and requires something to store', async () => {
    expect((await PUT(put({ rules: [{ id: 'a', key: '', equals: ['x'], type: 'flat', amount: 1 }] }))).status).toBe(400)
    expect((await PUT(put({ rules: [] }))).status).toBe(400)
    expect((await PUT(put({ fallback: { type: 'percent', amount: 20_000 } }))).status).toBe(400)
  })

  it('stores the account default and reports shadowed rules', async () => {
    const res = await PUT(put({ fallback: { type: 'percent', amount: 1000 } }))
    expect(res.status).toBe(200)
    expect(db.rewardConfig.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { userId_scopeKey: { userId: 'u1', scopeKey: 'account' } } }))
    expect((await res.json()).scope).toBe('account')
  })

  it('refuses a link the caller cannot edit', async () => {
    db.url.findUnique.mockResolvedValue({ userId: 'other', workspaceId: null })
    const res = await PUT(put({ urlId: 'url_9', fallback: { type: 'flat', amount: 100 } }))
    expect(res.status).toBe(404)
    expect(db.rewardConfig.upsert).not.toHaveBeenCalled()
  })

  it('scopes a link config by short code for owners', async () => {
    db.url.findUnique.mockImplementation(async ({ where }: { where: { id?: string; shortCode?: string } }) => (where.shortCode ? { id: 'url_1' } : { userId: 'u1', workspaceId: null }))
    await PUT(put({ shortCode: 'abc', fallback: { type: 'flat', amount: 100 } }))
    expect(db.rewardConfig.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { userId_scopeKey: { userId: 'u1', scopeKey: 'link:url_1' } } }))
  })

  it('404s when deleting an unconfigured scope', async () => {
    db.rewardConfig.deleteMany.mockResolvedValue({ count: 0 })
    expect((await DELETE(new NextRequest('http://x/api/rewards/config?urlId=u', { method: 'DELETE' }))).status).toBe(404)
  })
})
