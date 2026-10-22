import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({ access: vi.fn(), rules: vi.fn(), goal: vi.fn(), raw: vi.fn() }))
vi.mock('@/lib/authorization', () => ({ getManageableUrl: m.access }))
vi.mock('@/lib/prisma', () => ({ prisma: { linkRule: { findMany: m.rules }, goal: { findFirst: m.goal }, $queryRaw: m.raw } }))
import { GET } from './route'

const ctx = { params: Promise.resolve({ shortCode: 'abc' }) }
const req = (qs = '') => new NextRequest(`http://x/api/links/abc/experiment${qs}`)

beforeEach(() => { vi.resetAllMocks(); m.access.mockResolvedValue({ url: { id: 'u1' } }) })

describe('GET experiment', () => {
  it('propagates auth failure', async () => {
    m.access.mockResolvedValue({ url: null, error: 'Unauthorized', status: 401 })
    expect((await GET(req(), ctx)).status).toBe(401)
  })
  it('validates params', async () => {
    expect((await GET(req('?days=0'), ctx)).status).toBe(400)
    expect((await GET(req('?confidence=0.1'), ctx)).status).toBe(400)
    m.rules.mockResolvedValue([{ id: 'a', name: 'A' }])
    expect((await GET(req('?control=zzz'), ctx)).status).toBe(400)
  })
  it('404s on a foreign goal', async () => {
    m.rules.mockResolvedValue([]); m.goal.mockResolvedValue(null)
    expect((await GET(req('?goalId=g'), ctx)).status).toBe(404)
  })
  it('returns a winner from aggregated counts', async () => {
    m.rules.mockResolvedValue([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }])
    m.raw.mockResolvedValueOnce([{ ruleId: 'a', n: 1000n }, { ruleId: 'b', n: 900n }]).mockResolvedValueOnce([{ ruleId: 'a', n: 50n }, { ruleId: 'b', n: 90n }])
    const res = await GET(req('?days=7'), ctx)
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.status).toBe('winner'); expect(body.winnerId).toBe('b'); expect(body.days).toBe(7)
    const b = body.bayesian.find((x: { id: string }) => x.id === 'b')
    expect(b.probBeatControl).toBeGreaterThan(0.99); expect(b.expectedLoss).toBeLessThan(0.001)
    expect(body.bayesian.find((x: { id: string }) => x.id === 'a').probBeatControl).toBeNull()
  })
  it('handles a link with no rules', async () => {
    m.rules.mockResolvedValue([])
    const body = await (await GET(req(), ctx)).json()
    expect(body.status).toBe('insufficient_data')
    expect(m.raw).not.toHaveBeenCalled()
  })
})
