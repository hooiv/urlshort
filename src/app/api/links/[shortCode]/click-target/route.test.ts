import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const update = vi.fn()
const findUnique = vi.fn()
vi.mock('@/lib/prisma', () => ({ prisma: { url: { update: (...a: unknown[]) => update(...a), findUnique: (...a: unknown[]) => findUnique(...a) } } }))
vi.mock('@/lib/authorization', () => ({ getManageableUrl: vi.fn(async () => ({ url: { id: 'u1', shortCode: 'abc' } })) }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(async () => ({ allowed: true })), rateLimitHeaders: () => ({}) }))
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn(async () => undefined) }))

import { GET, PUT, DELETE } from './route'

const ctx = { params: Promise.resolve({ shortCode: 'abc' }) }
const put = (body: unknown) => new NextRequest('http://x/api/links/abc/click-target', { method: 'PUT', body: typeof body === 'string' ? body : JSON.stringify(body) })
const future = () => new Date(Date.now() + 10 * 86_400_000).toISOString()

beforeEach(() => { update.mockReset(); findUnique.mockReset() })

describe('click-target route', () => {
  it('rejects bad input', async () => {
    expect((await PUT(put('nope'), ctx)).status).toBe(400)
    expect((await PUT(put({ target: 0, deadline: future() }), ctx)).status).toBe(400)
    expect((await PUT(put({ target: 1.5, deadline: future() }), ctx)).status).toBe(400)
    expect((await PUT(put({ target: 10, deadline: 'x' }), ctx)).status).toBe(400)
    expect((await PUT(put({ target: 10, deadline: '2000-01-01' }), ctx)).status).toBe(400)
    expect(update).not.toHaveBeenCalled()
  })
  it('sets a target and returns pacing', async () => {
    update.mockImplementation(async ({ data }) => ({ id: 'u1', shortCode: 'abc', clicks: 5, createdAt: new Date(Date.now() - 86_400_000), ...data }))
    const res = await PUT(put({ target: 100, deadline: future() }), ctx)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.target).toBe(100)
    expect(json.progress.status).toBe('behind')
  })
  it('gets and clears', async () => {
    findUnique.mockResolvedValue({ clicks: 0, createdAt: new Date(), clickTarget: null, clickTargetDeadline: null })
    expect((await (await GET(new NextRequest('http://x/a'), ctx)).json()).progress).toBeNull()
    update.mockResolvedValue({})
    expect((await DELETE(new NextRequest('http://x/a', { method: 'DELETE' }), ctx)).status).toBe(200)
  })
})
