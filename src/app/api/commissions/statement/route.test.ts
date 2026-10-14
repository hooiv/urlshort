import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const resolveActor = vi.fn()
const db = vi.hoisted(() => ({ commission: { groupBy: vi.fn() } }))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/request-actor', () => ({ LINK_READ_SCOPES: ['links:read'], resolveActor: (...a: unknown[]) => resolveActor(...a) }))

import { GET } from './route'

describe('GET /api/commissions/statement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveActor.mockResolvedValue({ actor: { userId: 'u1' } })
    db.commission.groupBy.mockResolvedValue([{ currency: 'usd', status: 'approved', _sum: { amountCents: 500, clawbackCents: 100 }, _count: { _all: 2 } }])
  })
  it('returns the monthly statement', async () => {
    const res = await GET(new NextRequest('http://x/api/commissions/statement?month=2026-09'))
    const json = await res.json()
    expect(json.lines[0]).toMatchObject({ currency: 'usd', netPayableCents: 400 })
  })
  it('400s on a bad month and 401s without auth', async () => {
    expect((await GET(new NextRequest('http://x/api/commissions/statement?month=2026-9'))).status).toBe(400)
    resolveActor.mockResolvedValue({ error: 'Authentication required', status: 401 })
    expect((await GET(new NextRequest('http://x/api/commissions/statement'))).status).toBe(401)
  })
})
