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
    expect(aggregateMock).toHaveBeenLastCalledWith({ kind: 'workspace', workspaceId: 'ws_x', tag: undefined }, expect.anything())
  })

  it('validates tags and dates', async () => {
    expect((await get('tag=%3Cscript%3E')).status).toBe(400)
    expect((await get('from=2026-05-01&to=2026-01-01')).status).toBe(400)
    expect(aggregateMock).not.toHaveBeenCalled()
  })
})
