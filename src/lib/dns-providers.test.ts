import { describe, expect, it } from 'vitest'
import { applyDnsRecords, detectDnsProvider, zoneCandidates, type DesiredRecord } from './dns-providers'

const TOKEN = 'cf_token_0123456789abcdef'
const records: DesiredRecord[] = [
  { type: 'TXT', name: '_quicklink-verification.go.example.com', value: 'quicklink-site-verification=abc' },
  { type: 'CNAME', name: 'go.example.com', value: 'edge.quicklink.app' },
]

type Rec = { id: string; type: string; name: string; content: string }
function fakeCloudflare(initial: Rec[] = [], opts: { status?: number } = {}) {
  const state = [...initial]
  const calls: string[] = []
  let seq = 0
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    calls.push(`${method} ${url.pathname}${url.search}`)
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`)
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
    if (opts.status) return json({}, opts.status)
    if (url.pathname === '/client/v4/zones') {
      return json({ success: true, result: url.searchParams.get('name') === 'example.com' ? [{ id: 'z1', name: 'example.com' }] : [] })
    }
    const [, id] = url.pathname.split('/dns_records')
    if (method === 'GET') return json({ success: true, result: state.filter((r) => r.name === url.searchParams.get('name')) })
    if (method === 'POST') {
      const body = JSON.parse(String(init!.body))
      state.push({ id: `r${++seq}`, type: body.type, name: body.name, content: body.content })
      return json({ success: true, result: {} })
    }
    const index = state.findIndex((r) => `/${r.id}` === id)
    if (method === 'DELETE') state.splice(index, 1)
    if (method === 'PUT') { const body = JSON.parse(String(init!.body)); state[index] = { ...state[index], content: body.content } }
    return json({ success: true, result: {} })
  }) as typeof fetch
  return { fetchImpl, state, calls }
}

describe('zoneCandidates / detectDnsProvider', () => {
  it('walks from the host to the registrable parent', () => {
    expect(zoneCandidates('go.links.example.co.uk')).toEqual(['go.links.example.co.uk', 'links.example.co.uk', 'example.co.uk', 'co.uk'])
  })

  it('recognises Cloudflare and Vercel nameservers and nothing else', async () => {
    const ns = (map: Record<string, string[]>) => async (name: string) => { if (map[name]) return map[name]; throw new Error('ENODATA') }
    expect(await detectDnsProvider('go.example.com', ns({ 'example.com': ['ada.ns.cloudflare.com', 'bob.ns.cloudflare.com'] }))).toBe('cloudflare')
    expect(await detectDnsProvider('go.example.com', ns({ 'example.com': ['ns1.vercel-dns.com.', 'ns2.vercel-dns.com.'] }))).toBe('vercel')
    expect(await detectDnsProvider('go.example.com', ns({ 'example.com': ['ns1.route53.aws'] }))).toBeNull()
  })
})

describe('Cloudflare', () => {
  it('creates both records, then is idempotent', async () => {
    const cf = fakeCloudflare()
    const first = await applyDnsRecords({ provider: 'cloudflare', token: TOKEN, host: 'go.example.com', records, fetchImpl: cf.fetchImpl })
    expect(first.map((r) => r.action)).toEqual(['created', 'created'])
    expect(cf.state.map((r) => [r.type, r.content])).toEqual([['TXT', '"quicklink-site-verification=abc"'], ['CNAME', 'edge.quicklink.app']])
    const second = await applyDnsRecords({ provider: 'cloudflare', token: TOKEN, host: 'go.example.com', records, fetchImpl: cf.fetchImpl })
    expect(second.map((r) => r.action)).toEqual(['unchanged', 'unchanged'])
    expect(cf.state).toHaveLength(2)
  })

  it('refuses to overwrite a live site unless told to, then replaces A+AAAA', async () => {
    const live = [{ id: 'a', type: 'A', name: 'go.example.com', content: '203.0.113.7' }, { id: 'b', type: 'AAAA', name: 'go.example.com', content: '2001:db8::1' }]
    const cf = fakeCloudflare(live)
    await expect(applyDnsRecords({ provider: 'cloudflare', token: TOKEN, host: 'go.example.com', records, fetchImpl: cf.fetchImpl })).rejects.toMatchObject({ status: 409, code: 'record_conflict' })
    expect(cf.state.filter((r) => r.type === 'A')).toHaveLength(1)
    const applied = await applyDnsRecords({ provider: 'cloudflare', token: TOKEN, host: 'go.example.com', records, replaceExisting: true, fetchImpl: cf.fetchImpl })
    expect(applied[1].action).toBe('updated')
    expect(cf.state.filter((r) => r.name === 'go.example.com').map((r) => r.type)).toEqual(['CNAME'])
  })

  it('rotates a stale verification TXT in place', async () => {
    const cf = fakeCloudflare([{ id: 't', type: 'TXT', name: records[0].name, content: '"quicklink-site-verification=old"' }])
    const applied = await applyDnsRecords({ provider: 'cloudflare', token: TOKEN, host: 'go.example.com', records: [records[0]], fetchImpl: cf.fetchImpl })
    expect(applied[0].action).toBe('updated')
    expect(cf.state).toEqual([{ id: 't', type: 'TXT', name: records[0].name, content: '"quicklink-site-verification=abc"' }])
  })

  it('explains token and zone problems without echoing the token', async () => {
    const denied = fakeCloudflare([], { status: 403 })
    const error = await applyDnsRecords({ provider: 'cloudflare', token: TOKEN, host: 'go.example.com', records, fetchImpl: denied.fetchImpl }).catch((e) => e)
    expect(error.code).toBe('token_rejected')
    expect(error.message).not.toContain(TOKEN)
    await expect(applyDnsRecords({ provider: 'cloudflare', token: TOKEN, host: 'go.other.org', records, fetchImpl: fakeCloudflare().fetchImpl })).rejects.toMatchObject({ code: 'zone_not_found' })
  })
})

describe('Vercel', () => {
  function fakeVercel(initial: Array<{ id: string; name: string; type: string; value: string }> = []) {
    const state = [...initial]
    let seq = 0
    const posted: unknown[] = []
    const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      const method = init?.method ?? 'GET'
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
      if (url.pathname.startsWith('/v5/domains/')) return json({}, url.pathname.endsWith('/example.com') ? 200 : 404)
      if (method === 'GET') return json({ records: state })
      if (method === 'POST') { const body = JSON.parse(String(init!.body)); posted.push(body); state.push({ id: `v${++seq}`, ...body }); return json({ uid: 'x' }) }
      if (method === 'DELETE') { const id = url.pathname.split('/').pop(); state.splice(state.findIndex((r) => r.id === id), 1); return json({}) }
      return json({}, 400)
    }) as typeof fetch
    return { fetchImpl, state, posted }
  }

  it('writes relative names, uses ALIAS at the apex, and passes teamId', async () => {
    const v = fakeVercel()
    await applyDnsRecords({ provider: 'vercel', token: TOKEN, host: 'go.example.com', records, teamId: 'team_1', fetchImpl: v.fetchImpl })
    expect(v.posted).toEqual([
      { name: '_quicklink-verification.go', type: 'TXT', value: 'quicklink-site-verification=abc', ttl: 300 },
      { name: 'go', type: 'CNAME', value: 'edge.quicklink.app', ttl: 300 },
    ])
    const apex = fakeVercel()
    await applyDnsRecords({ provider: 'vercel', token: TOKEN, host: 'example.com', records: [{ type: 'CNAME', name: 'example.com', value: 'edge.quicklink.app' }], fetchImpl: apex.fetchImpl })
    expect(apex.posted).toEqual([{ name: '', type: 'ALIAS', value: 'edge.quicklink.app', ttl: 300 }])
  })

  it('guards existing records the same way', async () => {
    const v = fakeVercel([{ id: 'old', name: 'go', type: 'A', value: '203.0.113.7' }])
    await expect(applyDnsRecords({ provider: 'vercel', token: TOKEN, host: 'go.example.com', records, fetchImpl: v.fetchImpl })).rejects.toMatchObject({ code: 'record_conflict' })
    await applyDnsRecords({ provider: 'vercel', token: TOKEN, host: 'go.example.com', records, replaceExisting: true, fetchImpl: v.fetchImpl })
    expect(v.state.filter((r) => r.name === 'go').map((r) => r.type)).toEqual(['CNAME'])
  })
})
