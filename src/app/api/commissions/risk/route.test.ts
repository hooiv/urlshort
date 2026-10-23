import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const resolveActor = vi.fn()
const assess = vi.fn()
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/request-actor', () => ({ LINK_READ_SCOPES: ['links:read'], resolveActor: (...a: unknown[]) => resolveActor(...a) }))
vi.mock('@/lib/commission-risk', () => ({ assessCommissionRisk: (...a: unknown[]) => assess(...a) }))

import { GET } from './route'

const req = (q = '') => new NextRequest(`http://localhost/api/commissions/risk${q}`)

describe('GET /api/commissions/risk', () => {
  beforeEach(() => { resolveActor.mockReset(); assess.mockReset() })
  it('rejects unauthenticated callers', async () => {
    resolveActor.mockResolvedValue({ actor: null, error: 'Authentication required', status: 401 })
    expect((await GET(req())).status).toBe(401)
  })
  it('enforces read scopes through resolveActor', async () => {
    resolveActor.mockResolvedValue({ actor: null, error: 'Missing scope', status: 403 })
    expect((await GET(req())).status).toBe(403)
    expect(resolveActor.mock.calls[0][1]).toEqual(['links:read'])
  })
  it('validates minLevel and filters + sorts', async () => {
    resolveActor.mockResolvedValue({ actor: { userId: 'u' } })
    expect((await GET(req('?minLevel=x'))).status).toBe(400)
    assess.mockResolvedValue([
      { commissionId: 'a', score: 0, level: 'low', signals: [] },
      { commissionId: 'b', score: 35, level: 'medium', signals: ['x'] },
      { commissionId: 'c', score: 90, level: 'high', signals: ['y'] },
    ])
    const body = await (await GET(req())).json()
    expect(body.risks.map((r: { commissionId: string }) => r.commissionId)).toEqual(['c', 'b'])
  })
})
