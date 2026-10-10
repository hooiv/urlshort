import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const getCurrentUser = vi.fn()
const findMany = vi.fn()
vi.mock('@/lib/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }))
vi.mock('@/lib/prisma', () => ({ prisma: { auditEvent: { findMany: (...a: unknown[]) => findMany(...a) } } }))

import { GET } from './route'

const req = (qs = '') => new NextRequest(`http://localhost/api/account/audit/export${qs}`)

describe('GET /api/account/audit/export', () => {
  beforeEach(() => {
    getCurrentUser.mockReset()
    findMany.mockReset().mockResolvedValue([])
  })

  it('requires authentication', async () => {
    getCurrentUser.mockResolvedValue(null)
    expect((await GET(req())).status).toBe(401)
    expect(findMany).not.toHaveBeenCalled()
  })

  it('rejects invalid and inverted date ranges', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u1' })
    expect((await GET(req('?from=garbage'))).status).toBe(400)
    expect((await GET(req('?from=2026-02-01&to=2026-01-01'))).status).toBe(400)
  })

  it('scopes the query to the caller and returns csv by default', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u1' })
    const res = await GET(req('?action=link.create'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    expect(res.headers.get('content-disposition')).toContain('audit-log.csv')
    expect(findMany.mock.calls[0][0].where).toMatchObject({ actorUserId: 'u1', action: 'link.create' })
  })

  it('returns ndjson for format=json', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u1' })
    const res = await GET(req('?format=json'))
    expect(res.headers.get('content-type')).toContain('ndjson')
    expect(res.headers.get('x-export-truncated')).toBe('0')
  })
})
