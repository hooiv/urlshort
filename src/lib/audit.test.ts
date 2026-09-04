import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const prismaMock = vi.hoisted(() => ({ auditEvent: { create: vi.fn() } }))
vi.mock('./prisma', () => ({ prisma: prismaMock }))

const sessionMock = vi.hoisted(() => ({ getCurrentSession: vi.fn() }))
vi.mock('@/lib/auth', () => sessionMock)

import { recordAudit } from './audit'

function requestWith(headers: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost/api/test', { headers })
}

describe('recordAudit actor attribution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionMock.getCurrentSession.mockResolvedValue(null)
    prismaMock.auditEvent.create.mockResolvedValue({})
  })

  it('attributes session callers as user', async () => {
    sessionMock.getCurrentSession.mockResolvedValue({ id: 's1', user: { id: 'u1' } })
    await recordAudit(requestWith({}), { action: 'link.create' })
    expect(prismaMock.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ actorType: 'user', actorUserId: 'u1', sessionId: 's1' }) }),
    )
  })

  it('attributes qlk_ Bearer callers as api_key, not management_token', async () => {
    await recordAudit(requestWith({ authorization: 'Bearer qlk_abc123_secret' }), { action: 'campaign.create' })
    expect(prismaMock.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ actorType: 'api_key' }) }),
    )
  })

  it('still attributes the management-token header as management_token', async () => {
    await recordAudit(requestWith({ 'x-management-token': 'tok123' }), { action: 'link.update' })
    expect(prismaMock.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ actorType: 'management_token' }) }),
    )
  })

  it('attributes unattributed callers as system', async () => {
    await recordAudit(requestWith({}), { action: 'maintenance.sweep' })
    expect(prismaMock.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ actorType: 'system' }) }),
    )
  })
})
