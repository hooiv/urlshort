import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const resolveActor = vi.fn()
const build = vi.fn()
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/request-actor', () => ({ LINK_READ_SCOPES: ['links:read'], resolveActor: (...a: unknown[]) => resolveActor(...a) }))
vi.mock('@/lib/commission-forecast', () => ({ buildCommissionForecast: (...a: unknown[]) => build(...a) }))
import { GET } from './route'

const req = () => new NextRequest('http://localhost/api/commissions/forecast')
describe('GET /api/commissions/forecast', () => {
  beforeEach(() => { resolveActor.mockReset(); build.mockReset() })
  it('401 and scope failures pass through', async () => {
    resolveActor.mockResolvedValue({ actor: null, error: 'Authentication required', status: 401 })
    expect((await GET(req())).status).toBe(401)
    resolveActor.mockResolvedValue({ actor: null, error: 'Missing scope', status: 403 })
    expect((await GET(req())).status).toBe(403)
    expect(resolveActor.mock.calls[0][1]).toEqual(['links:read'])
  })
  it('returns forecasts for the actor', async () => {
    resolveActor.mockResolvedValue({ actor: { userId: 'u1' } })
    build.mockResolvedValue([{ currency: 'usd' }])
    const res = await GET(req())
    expect(build.mock.calls[0][1]).toBe('u1')
    expect((await res.json()).forecasts).toHaveLength(1)
  })
})
