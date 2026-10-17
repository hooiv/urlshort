import { describe, expect, it, vi } from 'vitest'
import { runPreflight, staticIssues, probeIssues, type PreflightDeps } from './link-preflight'

const healthy = { status: 'healthy' as const, statusCode: 200, latencyMs: 120, error: null, finalUrl: 'https://example.com/a' }
const deps = (over: Partial<PreflightDeps> = {}): PreflightDeps => ({
  probe: vi.fn(async () => healthy),
  findDuplicates: vi.fn(async () => []),
  ...over,
})
const codes = (r: { issues: { code: string }[] }) => r.issues.map((i) => i.code)

describe('staticIssues', () => {
  it('rejects empty, invalid, non-http and credentialed URLs', () => {
    expect(staticIssues('  ').issues[0].code).toBe('empty')
    expect(staticIssues('example.com').issues[0].code).toBe('invalid')
    expect(staticIssues('ftp://example.com').issues[0].code).toBe('scheme')
    expect(staticIssues('https://u:p@example.com').issues.map((i) => i.code)).toContain('credentials')
    expect(staticIssues('https://example.com/' + 'a'.repeat(2100)).issues[0].code).toBe('too_long')
  })
  it('warns on http and click ids', () => {
    const c = staticIssues('http://example.com/?fbclid=1&x=2').issues.map((i) => i.code)
    expect(c).toEqual(expect.arrayContaining(['insecure', 'click_ids']))
  })
})

describe('probeIssues', () => {
  it('maps down, degraded and slow', () => {
    expect(probeIssues({ ...healthy, status: 'down', statusCode: null, error: 'timeout' })[0].code).toBe('unreachable')
    expect(probeIssues({ ...healthy, status: 'degraded', statusCode: 403 })[0].code).toBe('degraded')
    expect(probeIssues({ ...healthy, latencyMs: 4000 })[0].code).toBe('slow')
    expect(probeIssues(healthy)).toEqual([])
  })
})

describe('runPreflight', () => {
  it('is ok for a clean destination and runs checks in parallel', async () => {
    const d = deps()
    const r = await runPreflight('https://example.com/a', d)
    expect(r.ok).toBe(true)
    expect(r.issues).toEqual([])
    expect(d.findDuplicates).toHaveBeenCalledWith('example.com/a')
  })
  it('does not touch the network for invalid input', async () => {
    const d = deps()
    const r = await runPreflight('nope', d)
    expect(r.ok).toBe(false)
    expect(d.probe).not.toHaveBeenCalled()
  })
  it('fails when destination is down', async () => {
    const r = await runPreflight('https://example.com/a', deps({ probe: async () => ({ ...healthy, status: 'down', statusCode: 500, error: null }) }))
    expect(r.ok).toBe(false)
    expect(codes(r)).toContain('unreachable')
  })
  it('reports cross-host redirects and duplicates, caps duplicates', async () => {
    const dups = Array.from({ length: 8 }, (_, i) => ({ shortCode: `c${i}`, title: null }))
    const r = await runPreflight('https://example.com/a', deps({
      probe: async () => ({ ...healthy, finalUrl: 'https://other.org/x' }),
      findDuplicates: async () => dups,
    }))
    expect(r.ok).toBe(true)
    expect(codes(r)).toEqual(expect.arrayContaining(['redirects', 'duplicate']))
    expect(r.duplicates).toHaveLength(5)
  })
  it('degrades gracefully when probe or duplicate lookup throws', async () => {
    const r = await runPreflight('https://example.com/a', deps({
      probe: async () => { throw new Error('boom') },
      findDuplicates: async () => { throw new Error('db') },
    }))
    expect(r.ok).toBe(true)
    expect(codes(r)).toContain('probe_failed')
    expect(r.duplicates).toEqual([])
  })
})

describe('self loop detection', () => {
  it('flags short links on the app host', async () => {
    const { staticIssues } = await import('@/lib/link-preflight')
    const { getBaseUrl } = await import('@/lib/utils')
    const r = staticIssues(`${getBaseUrl()}/abc123`)
    expect(r.issues.some((i) => i.code === 'self_loop' && i.severity === 'error')).toBe(true)
  })
  it('allows external hosts', async () => {
    const { staticIssues } = await import('@/lib/link-preflight')
    expect(staticIssues('https://example.org/abc').issues.some((i) => i.code === 'self_loop')).toBe(false)
  })
})
