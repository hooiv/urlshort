import { createHmac } from 'node:crypto'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/server', async importOriginal => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: (fn: () => unknown) => { void fn() } }
})

const SECRET = 'edge-test-secret-0123456789abcdefghij'

function signed(link: Record<string, unknown>) {
  const contentHash = 'hash-' + Math.random().toString(36).slice(2)
  const signature = createHmac('sha256', SECRET).update('.' + contentHash).digest('base64url')
  return { contentHash, signature, version: 1, link: { shortCode: 'abc', originalUrl: 'https://dest.example/', expiresAt: null, revision: null, rules: [], campaigns: [], ...link } }
}

async function run(link: Record<string, unknown>) {
  vi.resetModules()
  const body = signed(link)
  vi.stubGlobal('fetch', vi.fn(async (u: string) => String(u).includes('/api/edge/config/')
    ? new Response(JSON.stringify(body), { status: 200 })
    : new Response(null, { status: 204 })))
  const { GET } = await import('./[shortCode]/route')
  return GET(new NextRequest('https://ql.test/edge/abc'), { params: Promise.resolve({ shortCode: 'abc' }) })
}

describe('edge route go-live scheduling', () => {
  beforeEach(() => { process.env.QL_CONFIG_SIGNING_SECRET = SECRET })
  afterEach(() => { vi.unstubAllGlobals() })

  it('sends visitors to /coming-soon before startsAt', async () => {
    const res = await run({ startsAt: new Date(Date.now() + 3600_000).toISOString() })
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('https://ql.test/coming-soon')
  })

  it('uses the custom teaser URL before startsAt', async () => {
    const res = await run({ startsAt: new Date(Date.now() + 3600_000).toISOString(), notStartedUrl: 'https://teaser.example/soon' })
    expect(res.headers.get('location')).toBe('https://teaser.example/soon')
  })

  it('routes normally once startsAt has passed', async () => {
    const res = await run({ startsAt: new Date(Date.now() - 3600_000).toISOString() })
    expect(res.headers.get('location')).toBe('https://dest.example/')
  })
})
