import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const resolveActor = vi.fn()
const db = vi.hoisted(() => ({
  commission: { findMany: vi.fn(), groupBy: vi.fn(), updateMany: vi.fn() },
  $transaction: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/request-actor', () => ({ LINK_READ_SCOPES: ['links:read'], LINK_WRITE_SCOPES: ['links:write'], resolveActor: (...a: unknown[]) => resolveActor(...a) }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(async () => ({ allowed: true })), rateLimitHeaders: () => ({}) }))

import { GET, POST } from './route'
import { GET as EXPORT } from './export/route'

const post = (body: unknown) => new NextRequest('http://x/api/commissions', { method: 'POST', body: JSON.stringify(body) })

describe('/api/commissions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveActor.mockResolvedValue({ actor: { userId: 'u1' } })
    db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db))
  })

  it('lists with totals and a cursor when there is another page', async () => {
    const rows = Array.from({ length: 51 }, (_, i) => ({ id: `c${i}`, url: { shortCode: 'abc' } }))
    db.commission.findMany.mockResolvedValue(rows)
    db.commission.groupBy.mockResolvedValue([{ status: 'pending', _count: { _all: 3 }, _sum: { amountCents: 900, clawbackCents: null } }])
    const json = await (await GET(new NextRequest('http://x/api/commissions'))).json()
    expect(json.commissions).toHaveLength(50)
    expect(json.nextCursor).toBe('c49')
    expect(json.totals.pending).toEqual({ count: 3, amountCents: 900, clawbackCents: 0 })
    expect(db.commission.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'u1' } }))
  })

  it('rejects an unknown status filter', async () => {
    expect((await GET(new NextRequest('http://x/api/commissions?status=lol'))).status).toBe(400)
  })

  it('needs write scope and a valid action to mutate', async () => {
    db.commission.updateMany.mockResolvedValue({ count: 2 })
    const res = await POST(post({ action: 'pay', ids: ['a', 'b'], payoutRef: 'wire-1' }))
    expect(res.status).toBe(200)
    expect(resolveActor).toHaveBeenLastCalledWith(expect.anything(), ['links:write'])
    expect(await res.json()).toEqual({ changed: 2 })
    expect((await POST(post({ action: 'burn', ids: ['a'] }))).status).toBe(400)
    expect((await POST(post({ action: 'pay' }))).status).toBe(400)
    expect((await POST(post({ action: 'pay', allDue: true }))).status).toBe(400)
  })

  it('approves every due pending commission for the caller only', async () => {
    db.commission.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }])
    db.commission.updateMany.mockResolvedValue({ count: 2 })
    await POST(post({ action: 'approve', allDue: true }))
    expect(db.commission.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 'u1', status: 'pending' }) }))
    expect(db.commission.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 'u1', id: { in: ['a', 'b'] } }) }))
  })

  it('exports approved commissions as CSV by default', async () => {
    db.commission.findMany.mockResolvedValue([{ id: 'c1', conversionId: 'v', saleValueCents: 1000, currency: 'USD', amountCents: 100, clawbackCents: 0, status: 'approved', ruleId: null, scopeKey: 'account', createdAt: new Date(0), approvedAt: null, paidAt: null, payoutRef: null, url: { shortCode: 'abc' } }])
    const res = await EXPORT(new NextRequest('http://x/api/commissions/export'))
    expect(res.headers.get('content-type')).toContain('text/csv')
    expect(db.commission.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'u1', status: 'approved' } }))
    expect(await res.text()).toContain('c1,abc,v,10.00,USD,1.00,0.00,1.00,approved')
  })
})
