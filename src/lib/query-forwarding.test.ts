import { describe, it, expect } from 'vitest'
import { parseQueryForwarding, filterForwardedParams, MAX_ALLOWLIST } from './query-forwarding'

const q = (s: string) => new URLSearchParams(s)
describe('parseQueryForwarding', () => {
  it('defaults to all', () => expect(parseQueryForwarding(undefined, undefined)).toEqual({ mode: 'all', allow: [] }))
  it('accepts none and drops allow', () => expect(parseQueryForwarding('none', ['x'])).toEqual({ mode: 'none', allow: [] }))
  it('normalizes and dedupes allowlist', () => {
    expect(parseQueryForwarding('allowlist', ['UTM_Source', ' utm_source ', 'gclid']).allow).toEqual(['utm_source', 'gclid'])
  })
  it('rejects bad mode, empty list, bad names, oversize', () => {
    expect(() => parseQueryForwarding('some', [])).toThrow()
    expect(() => parseQueryForwarding('allowlist', [])).toThrow()
    expect(() => parseQueryForwarding('allowlist', ['a b'])).toThrow()
    expect(() => parseQueryForwarding('allowlist', [5])).toThrow()
    expect(() => parseQueryForwarding('allowlist', Array.from({ length: MAX_ALLOWLIST + 1 }, (_, i) => `p${i}`))).toThrow()
  })
})
describe('filterForwardedParams', () => {
  it('all passes everything except internal/credential params', () => {
    const r = filterForwardedParams(q('a=1&ql_attribution=x&Password=p&access_token=t&b=2'), { mode: 'all' })
    expect(r.toString()).toBe('a=1&b=2')
  })
  it('none forwards nothing', () => expect(filterForwardedParams(q('a=1'), { mode: 'none' }).toString()).toBe(''))
  it('allowlist is case-insensitive and keeps repeated keys', () => {
    expect(filterForwardedParams(q('UTM_source=a&x=1&gclid=1&gclid=2'), { mode: 'allowlist', allow: ['utm_source', 'gclid'] }).toString())
      .toBe('UTM_source=a&gclid=1&gclid=2')
  })
  it('null policy behaves as all', () => expect(filterForwardedParams(q('a=1'), null).toString()).toBe('a=1'))
})
