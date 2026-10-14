import { describe, expect, it } from 'vitest'
import { traceRedirects, type TraceDeps } from './redirect-trace'

function deps(map: Record<string, { status: number; location?: string }>, blocked: string[] = []): TraceDeps {
  let t = 0
  return {
    now: () => (t += 5),
    assertPublic: async (u) => { if (blocked.includes(u.hostname)) throw new Error('Private IP destinations are not allowed') },
    fetchHop: async (url) => {
      const r = map[url]
      if (!r) throw new Error('boom')
      return { status: r.status, location: r.location ?? null }
    },
  }
}

describe('traceRedirects', () => {
  it('follows a chain and resolves relative locations', async () => {
    const r = await traceRedirects('https://a.com/', deps({ 'https://a.com/': { status: 301, location: '/b' }, 'https://a.com/b': { status: 200 } }))
    expect(r.hops.map((h) => h.status)).toEqual([301, 200])
    expect(r.finalUrl).toBe('https://a.com/b')
    expect(r.loop).toBe(false)
  })
  it('detects loops', async () => {
    const r = await traceRedirects('https://a.com/', deps({ 'https://a.com/': { status: 302, location: 'https://b.com/' }, 'https://b.com/': { status: 302, location: 'https://a.com/' } }))
    expect(r.loop).toBe(true)
    expect(r.hops).toHaveLength(2)
  })
  it('flags https to http downgrade', async () => {
    const r = await traceRedirects('https://a.com/', deps({ 'https://a.com/': { status: 301, location: 'http://a.com/x' }, 'http://a.com/x': { status: 200 } }))
    expect(r.insecureDowngrade).toBe(true)
  })
  it('blocks private hops mid-chain', async () => {
    const r = await traceRedirects('https://a.com/', deps({ 'https://a.com/': { status: 302, location: 'http://internal.test/' } }, ['internal.test']))
    expect(r.hops[1].error).toMatch(/Private/)
    expect(r.hops[1].status).toBeNull()
  })
  it('truncates at max hops and rejects non-http schemes', async () => {
    const map: Record<string, { status: number; location?: string }> = {}
    for (let i = 0; i < 5; i += 1) map[`https://a.com/${i}`] = { status: 302, location: `/${i + 1}` }
    const r = await traceRedirects('https://a.com/0', deps(map), 3)
    expect(r.truncated).toBe(true)
    expect(r.hops).toHaveLength(3)
    const s = await traceRedirects('https://a.com/', deps({ 'https://a.com/': { status: 302, location: 'javascript:alert(1)' } }))
    expect(s.hops[0].error).toMatch(/non-HTTP/)
  })
})
