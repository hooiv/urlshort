import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const accessMock = vi.hoisted(() => vi.fn())
const registerMock = vi.hoisted(() => vi.fn())
const applyMock = vi.hoisted(() => vi.fn())
const auditMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/authorization', () => ({ getManageableUrl: accessMock }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(async () => ({ allowed: true })) }))
vi.mock('@/lib/audit', () => ({ recordAudit: auditMock }))
vi.mock('@/lib/domain-registration', async () => {
  class DomainOwnershipError extends Error {}
  return { DomainOwnershipError, registerDomain: registerMock }
})
vi.mock('@/lib/dns-providers', async (orig) => ({ ...(await orig<typeof import('@/lib/dns-providers')>()), applyDnsRecords: applyMock }))

import { POST } from './route'
import { DnsSetupError } from '@/lib/dns-providers'
import { DomainOwnershipError } from '@/lib/domain-registration'

const TOKEN = 'secret_token_abcdefghijklmnop'
const post = (body: unknown) => POST(new NextRequest('https://ql.test/api/links/abc/domains/connect', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ shortCode: 'abc' }) })

describe('POST /domains/connect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.BRANDED_DOMAIN_CNAME_TARGET = 'edge.quicklink.app'
    accessMock.mockResolvedValue({ url: { id: 'url_1' } })
    registerMock.mockResolvedValue({ id: 'dom_1', status: 'pending', verificationToken: 'tok' })
    applyMock.mockImplementation(async ({ records }) => records.map((r: object) => ({ ...r, action: 'created' })))
  })

  it('writes the TXT and CNAME and never records the token', async () => {
    const res = await post({ host: 'Go.Example.com', provider: 'cloudflare', apiToken: TOKEN })
    expect(res.status).toBe(200)
    expect(applyMock).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'cloudflare',
      host: 'go.example.com',
      records: [
        { type: 'TXT', name: '_quicklink-verification.go.example.com', value: 'quicklink-site-verification=tok' },
        { type: 'CNAME', name: 'go.example.com', value: 'edge.quicklink.app' },
      ],
    }))
    expect(JSON.stringify(auditMock.mock.calls)).not.toContain(TOKEN)
    expect(JSON.stringify(await res.json())).not.toContain(TOKEN)
  })

  it('maps provider and ownership failures to clear statuses', async () => {
    applyMock.mockRejectedValueOnce(new DnsSetupError('go.example.com already points somewhere else', 409, 'record_conflict'))
    const conflict = await post({ host: 'go.example.com', provider: 'vercel', apiToken: TOKEN })
    expect(conflict.status).toBe(409)
    expect((await conflict.json()).code).toBe('record_conflict')
    registerMock.mockRejectedValueOnce(new DomainOwnershipError('This domain is already owned by another link account'))
    expect((await post({ host: 'go.example.com', provider: 'vercel', apiToken: TOKEN })).status).toBe(409)
  })

  it('rejects bad input and unauthorised callers', async () => {
    expect((await post({ host: 'go.example.com', provider: 'route53', apiToken: TOKEN })).status).toBe(400)
    expect((await post({ host: 'localhost', provider: 'cloudflare', apiToken: TOKEN })).status).toBe(400)
    accessMock.mockResolvedValueOnce({ url: null, error: 'Forbidden', status: 403 })
    expect((await post({ host: 'go.example.com', provider: 'cloudflare', apiToken: TOKEN })).status).toBe(403)
    expect(applyMock).not.toHaveBeenCalled()
  })
})
