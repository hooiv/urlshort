import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const prismaMock = vi.hoisted(() => ({ membership: { findUnique: vi.fn() } }))
const aggregateMock = vi.hoisted(() => vi.fn())
const userMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/auth', () => ({ getCurrentUser: userMock }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(async () => ({ allowed: true })) }))
vi.mock('@/lib/aggregate-analytics', async (orig) => ({ ...(await orig<typeof import('@/lib/aggregate-analytics')>()), getAggregatedAnalytics: aggregateMock }))

import { GET } from './route'

const get = (query: string) => GET(new NextRequest(`https://ql.test/api/analytics?${query}`))

describe('GET /api/analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    userMock.mockResolvedValue({ id: 'user_a' })
    aggregateMock.mockResolvedValue({ ok: true })
  })

  it('requires a user', async () => {
    userMock.mockResolvedValue(null)
    expect((await get('')).status).toBe(401)
  })

  it('scopes to the caller\'s personal links by default', async () => {
    expect((await get('range=7d&tag=Launch')).status).toBe(200)
    expect(aggregateMock).toHaveBeenCalledWith({ kind: 'user', userId: 'user_a', tag: 'launch' }, expect.objectContaining({ days: 7 }))
  })

  it('hides workspaces the caller cannot read', async () => {
    prismaMock.membership.findUnique.mockResolvedValue(null)
    expect((await get('workspaceId=ws_x')).status).toBe(404)
    prismaMock.membership.findUnique.mockResolvedValue({ role: 'viewer' })
    expect((await get('workspaceId=ws_x')).status).toBe(200)
    // Non-admins get the restricted-folder filter; admins see everything.
    expect(aggregateMock).toHaveBeenLastCalledWith({ kind: 'workspace', workspaceId: 'ws_x', tag: undefined, folderId: undefined, viewer: { userId: 'user_a' } }, expect.anything())
    prismaMock.membership.findUnique.mockResolvedValue({ role: 'admin' })
    await get('workspaceId=ws_x&folder=none')
    expect(aggregateMock).toHaveBeenLastCalledWith({ kind: 'workspace', workspaceId: 'ws_x', tag: undefined, folderId: null, viewer: undefined }, expect.anything())
  })

  it('validates tags and dates', async () => {
    expect((await get('tag=%3Cscript%3E')).status).toBe(400)
    expect((await get('from=2026-05-01&to=2026-01-01')).status).toBe(400)
    expect(aggregateMock).not.toHaveBeenCalled()
  })

  it('exports CSV and rejects bad formats', async () => {
    aggregateMock.mockResolvedValue({ window: { from: '2026-10-01', to: '2026-10-01', days: 1 }, timeseries: [{ date: '2026-10-01', clicks: 1, conversions: 0, revenueCents: 0 }] })
    const res = await get('range=7d&format=csv')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    expect(res.headers.get('content-disposition')).toContain('quicklink-timeseries-')
    expect(await res.text()).toContain('"2026-10-01","1","0","0.00"')
    expect((await get('format=xml')).status).toBe(400)
    expect((await get('format=csv&section=x')).status).toBe(400)
  })
})
