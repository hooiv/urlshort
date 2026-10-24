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

describe('edge route visitor blocklist', () => {
  beforeEach(() => { process.env.QL_CONFIG_SIGNING_SECRET = SECRET })
  afterEach(() => { vi.unstubAllGlobals() })
  const block = { cidrs: ['203.0.113.0/24', '2001:db8::/32'], referrerHosts: ['scraper.example'] }

  async function runWith(headers: Record<string, string>) {
    vi.resetModules()
    const body = signed({ visitorBlock: block })
    vi.stubGlobal('fetch', vi.fn(async (u: string) => String(u).includes('/api/edge/config/')
      ? new Response(JSON.stringify(body), { status: 200 })
      : new Response(null, { status: 204 })))
    const { GET } = await import('./[shortCode]/route')
    return GET(new NextRequest('https://ql.test/edge/abc', { headers }), { params: Promise.resolve({ shortCode: 'abc' }) })
  }

  it('blocks a listed IPv4 range', async () => {
    const res = await runWith({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' })
    expect(res.headers.get('location')).toBe('https://ql.test/region-unavailable')
  })
  it('blocks a listed IPv6 range', async () => {
    const res = await runWith({ 'x-forwarded-for': '2001:db8:1::5' })
    expect(res.headers.get('location')).toBe('https://ql.test/region-unavailable')
  })
  it('blocks a listed referrer subdomain', async () => {
    const res = await runWith({ referer: 'https://www.scraper.example/page' })
    expect(res.headers.get('location')).toBe('https://ql.test/region-unavailable')
  })
  it('lets other visitors through', async () => {
    const res = await runWith({ 'x-forwarded-for': '198.51.100.7', referer: 'https://good.example/' })
    expect(res.headers.get('location')).toBe('https://dest.example/')
  })
})

describe('edge route geo-fence', () => {
  beforeEach(() => { process.env.QL_CONFIG_SIGNING_SECRET = SECRET })
  afterEach(() => { vi.unstubAllGlobals() })

  async function runFence(geoFence: Record<string, unknown>, headers: Record<string, string>) {
    vi.resetModules()
    const body = signed({ geoFence })
    vi.stubGlobal('fetch', vi.fn(async (u: string) => String(u).includes('/api/edge/config/')
      ? new Response(JSON.stringify(body), { status: 200 })
      : new Response(null, { status: 204 })))
    const { GET } = await import('./[shortCode]/route')
    return GET(new NextRequest('https://ql.test/edge/abc', { headers }), { params: Promise.resolve({ shortCode: 'abc' }) })
  }

  it('blocks countries outside an allow-list', async () => {
    const res = await runFence({ mode: 'allow', countries: ['US'] }, { 'x-vercel-ip-country': 'DE' })
    expect(res.headers.get('location')).toBe('https://ql.test/region-unavailable')
  })

  it('lets allow-listed countries through', async () => {
    const res = await runFence({ mode: 'allow', countries: ['US'] }, { 'cf-ipcountry': 'us' })
    expect(res.headers.get('location')).toBe('https://dest.example/')
  })

  it('blocks denied countries and honours allowUnknown for missing headers', async () => {
    const denied = await runFence({ mode: 'deny', countries: ['RU'] }, { 'cf-ipcountry': 'RU' })
    expect(denied.headers.get('location')).toBe('https://ql.test/region-unavailable')
    const unknown = await runFence({ mode: 'allow', countries: ['US'], allowUnknown: false }, {})
    expect(unknown.headers.get('location')).toBe('https://ql.test/region-unavailable')
  })
})

describe('edge route active hours', () => {
  beforeEach(() => { process.env.QL_CONFIG_SIGNING_SECRET = SECRET })
  afterEach(() => { vi.unstubAllGlobals() })
  const allDays = [0, 1, 2, 3, 4, 5, 6]
  const never = { timezone: 'UTC', windows: [{ days: allDays, start: '00:00', end: '00:01' }] }
  const always = { timezone: 'UTC', windows: [{ days: allDays, start: '00:00', end: '00:00' }] }

  it('redirects to the off-hours URL outside the windows', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-22T12:00:00Z'))
    try {
      const res = await run({ activeHours: never, offHoursUrl: 'https://closed.example/' })
      expect(res.headers.get('location')).toBe('https://closed.example/')
    } finally { vi.useRealTimers() }
  })

  it('falls back to /coming-soon without an off-hours URL', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-22T12:00:00Z'))
    try {
      const res = await run({ activeHours: never })
      expect(res.headers.get('location')).toBe('https://ql.test/coming-soon')
    } finally { vi.useRealTimers() }
  })

  it('routes normally inside the windows', async () => {
    const res = await run({ activeHours: always })
    expect(res.headers.get('location')).toBe('https://dest.example/')
  })
})

describe('edge route click caps', () => {
  beforeEach(() => { process.env.QL_CONFIG_SIGNING_SECRET = SECRET })
  afterEach(() => { vi.unstubAllGlobals() })

  it('hands capped links to the main route so the cap is enforced atomically', async () => {
    const res = await run({ needsCounter: true })
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('https://ql.test/abc')
  })

  it('serves uncapped links at the edge', async () => {
    const res = await run({ needsCounter: false })
    expect(res.headers.get('location')).toBe('https://dest.example/')
  })
})
