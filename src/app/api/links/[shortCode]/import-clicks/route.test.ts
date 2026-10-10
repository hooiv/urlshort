import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const accessMock = vi.hoisted(() => vi.fn())
const fetchMock = vi.hoisted(() => vi.fn())
const applyMock = vi.hoisted(() => vi.fn())
const auditMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/authorization', () => ({ getManageableUrl: accessMock }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(async () => ({ allowed: true })) }))
vi.mock('@/lib/audit', () => ({ recordAudit: auditMock }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/click-history-import', () => ({ fetchBitlyDailyClicks: fetchMock, applyDailyHistory: applyMock }))

import { POST } from './route'

const post = (body: unknown) => POST(new NextRequest('https://ql.test/api/links/abc/import-clicks', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ shortCode: 'abc' }) })
const good = { provider: 'bitly', apiToken: 'tok_1234567890', bitlinkId: 'bit.ly/abc' }

describe('POST /import-clicks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    accessMock.mockResolvedValue({ url: { id: 'url_1' } })
    fetchMock.mockResolvedValue([{ dateKey: '2026-10-01', clicks: 3 }])
    applyMock.mockResolvedValue({ added: 1, skipped: 0, clicks: 3 })
  })
  it('imports, audits without the token, and reports counts', async () => {
    const res = await post(good)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ provider: 'bitly', daysFound: 1, added: 1, skipped: 0, clicks: 3 })
    expect(applyMock).toHaveBeenCalledWith({}, 'url_1', [{ dateKey: '2026-10-01', clicks: 3 }])
    expect(JSON.stringify(auditMock.mock.calls)).not.toContain('tok_1234567890')
  })
  it('denies without access', async () => {
    accessMock.mockResolvedValue({ error: 'Forbidden', status: 403 })
    expect((await post(good)).status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('rejects bad bodies', async () => {
    expect((await post({ ...good, provider: 'other' })).status).toBe(400)
  })
  it('maps provider failures', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Bitly rejected the token'))
    expect((await post(good)).status).toBe(401)
    fetchMock.mockRejectedValueOnce(new Error('Invalid bitlink id'))
    expect((await post(good)).status).toBe(400)
    fetchMock.mockRejectedValueOnce(new Error('Bitly returned an error (500)'))
    expect((await post(good)).status).toBe(502)
    expect(applyMock).not.toHaveBeenCalled()
  })
})
