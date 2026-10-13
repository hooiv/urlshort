import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const resolveActor = vi.fn()
const restoreAllTrash = vi.fn()
const emptyTrash = vi.fn()
vi.mock('@/lib/request-actor', () => ({ LINK_READ_SCOPES: ['links:read'], LINK_WRITE_SCOPES: ['links:write'], resolveActor: (...a: unknown[]) => resolveActor(...a) }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => ({ allowed: true }), rateLimitHeaders: () => ({}) }))
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn() }))
vi.mock('@/lib/link-trash', () => ({ listTrash: vi.fn(), TRASH_RETENTION_DAYS: 30, restoreAllTrash: (...a: unknown[]) => restoreAllTrash(...a), emptyTrash: (...a: unknown[]) => emptyTrash(...a) }))

import { POST } from './route'

const req = (body: unknown) => new NextRequest('http://x/api/links/trash', { method: 'POST', body: JSON.stringify(body) })

describe('POST /api/links/trash', () => {
  beforeEach(() => { vi.clearAllMocks(); resolveActor.mockResolvedValue({ actor: { userId: 'u1' } }) })
  it('requires links:write and propagates auth failures', async () => {
    resolveActor.mockResolvedValue({ error: 'nope', status: 403 })
    expect((await POST(req({ action: 'empty' }))).status).toBe(403)
    expect(resolveActor.mock.calls[0][1]).toEqual(['links:write'])
    expect(emptyTrash).not.toHaveBeenCalled()
  })
  it('rejects unknown actions', async () => {
    expect((await POST(req({ action: 'drop' }))).status).toBe(400)
  })
  it('restores or empties for the caller only', async () => {
    restoreAllTrash.mockResolvedValue(4); emptyTrash.mockResolvedValue(2)
    expect(await (await POST(req({ action: 'restore_all' }))).json()).toEqual({ action: 'restore_all', count: 4 })
    expect(await (await POST(req({ action: 'empty' }))).json()).toEqual({ action: 'empty', count: 2 })
    expect(emptyTrash).toHaveBeenCalledWith('u1')
  })
})
