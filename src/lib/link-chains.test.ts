import { describe, expect, it } from 'vitest'
import { hostSet, internalShortCode, resolveChains } from './link-chains'

const hosts = hostSet(['https://ql.io'], ['go.acme.com'])
const L = (shortCode: string, originalUrl: string) => ({ shortCode, originalUrl })

describe('link-chains', () => {
  it('detects internal short codes only for own hosts and single segment', () => {
    expect(internalShortCode('https://ql.io/abc', hosts)).toBe('abc')
    expect(internalShortCode('https://GO.acme.com/x?y=1', hosts)).toBe('x')
    expect(internalShortCode('https://ql.io/a/b', hosts)).toBeNull()
    expect(internalShortCode('https://other.io/abc', hosts)).toBeNull()
    expect(internalShortCode('ftp://ql.io/abc', hosts)).toBeNull()
    expect(internalShortCode('nonsense', hosts)).toBeNull()
  })
  it('resolves multi-hop chains to the final destination, longest first', () => {
    const out = resolveChains([L('a', 'https://ql.io/b'), L('b', 'https://go.acme.com/c'), L('c', 'https://example.com/z'), L('d', 'https://ql.io/c'), L('e', 'https://x.com')], hosts)
    expect(out).toEqual([
      { shortCode: 'a', hops: ['b', 'c'], finalUrl: 'https://example.com/z', status: 'chain' },
      { shortCode: 'b', hops: ['c'], finalUrl: 'https://example.com/z', status: 'chain' },
      { shortCode: 'd', hops: ['c'], finalUrl: 'https://example.com/z', status: 'chain' },
    ])
  })
  it('flags cycles, self-links and the hop cap', () => {
    const cyc = resolveChains([L('a', 'https://ql.io/b'), L('b', 'https://ql.io/a'), L('s', 'https://ql.io/s')], hosts)
    expect(cyc.map((c) => [c.shortCode, c.status, c.finalUrl])).toEqual([['a', 'cycle', null], ['b', 'cycle', null], ['s', 'cycle', null]])
    const many = Array.from({ length: 6 }, (_, i) => L(`k${i}`, `https://ql.io/k${i + 1}`))
    const capped = resolveChains(many, hosts, 3).find((c) => c.shortCode === 'k0')
    expect(capped?.status).toBe('too_long')
  })
  it('reports a missing target without a final url', () => {
    expect(resolveChains([L('a', 'https://ql.io/gone')], hosts)).toEqual([{ shortCode: 'a', hops: ['gone'], finalUrl: null, status: 'chain' }])
  })
})
