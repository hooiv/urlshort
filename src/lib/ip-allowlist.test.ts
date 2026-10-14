import { describe, expect, it } from 'vitest'
import { ipAllowed, parseAllowlist, parseCidr } from './ip-allowlist'

describe('ip allowlist', () => {
  it('parses and normalises entries', () => {
    expect(parseAllowlist(['10.0.0.0/8', '10.0.0.0/8', '2001:DB8::/32'])).toEqual(['10.0.0.0/8', '2001:db8::/32'])
    expect(parseAllowlist(undefined)).toEqual([])
  })
  it('rejects bad input', () => {
    for (const bad of ['10.0.0.0/33', '999.1.1.1', 'abc', '1.2.3.4/8/8', '::/129', '1.2.3.4/x']) expect(parseCidr(bad)).toBeNull()
    expect(parseAllowlist(['ok'])).toBeNull()
    expect(parseAllowlist('1.1.1.1')).toBeNull()
    expect(parseAllowlist(Array(21).fill('1.1.1.1'))).toBeNull()
  })
  it('matches IPv4 CIDR and exact', () => {
    expect(ipAllowed('10.4.5.6', ['10.0.0.0/8'])).toBe(true)
    expect(ipAllowed('11.0.0.1', ['10.0.0.0/8'])).toBe(false)
    expect(ipAllowed('1.2.3.4', ['1.2.3.4'])).toBe(true)
    expect(ipAllowed('1.2.3.5', ['1.2.3.4'])).toBe(false)
  })
  it('matches IPv6 and v4-mapped', () => {
    expect(ipAllowed('2001:db8:abcd::1', ['2001:db8::/32'])).toBe(true)
    expect(ipAllowed('2001:db9::1', ['2001:db8::/32'])).toBe(false)
    expect(ipAllowed('::ffff:10.1.1.1', ['10.0.0.0/8'])).toBe(true)
    expect(ipAllowed('::1', ['::1'])).toBe(true)
    expect(ipAllowed('1.2.3.4', ['2001:db8::/32'])).toBe(false)
  })
  it('empty list allows all; unknown ip denied when restricted', () => {
    expect(ipAllowed('unknown', [])).toBe(true)
    expect(ipAllowed('unknown', ['1.2.3.4'])).toBe(false)
  })
})
