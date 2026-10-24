import { describe, expect, it } from 'vitest'
import { evaluateVisitorBlock, ipToBytes, parseCidr, parseVisitorBlock } from './visitor-block'

function block(input: unknown) {
  const r = parseVisitorBlock(input)
  if (!r.ok) throw new Error(r.error)
  return r.block
}

describe('parseCidr', () => {
  it('masks host bits so equal ranges dedupe', () => {
    expect(parseCidr('10.1.2.3/8')?.canonical).toBe('10.0.0.0/8')
    expect(parseCidr('1.2.3.4')?.canonical).toBe('1.2.3.4')
  })
  it('rejects bad input', () => {
    for (const s of ['', 'x', '1.2.3.4/33', '1.2.3/24', '::1/129', '1.2.3.4/a', '999.1.1.1']) expect(parseCidr(s)).toBeNull()
  })
  it('handles IPv6 shorthand and mapped v4', () => {
    expect(Array.from(ipToBytes('::1')!).slice(14)).toEqual([0, 1])
    expect(Array.from(ipToBytes('::ffff:1.2.3.4')!).slice(10)).toEqual([0xff, 0xff, 1, 2, 3, 4])
    expect(Array.from(ipToBytes('1.2.3.4')!).slice(10)).toEqual([0xff, 0xff, 1, 2, 3, 4])
  })
})

describe('parseVisitorBlock', () => {
  it('clears on null or empty lists', () => {
    expect(block(null)).toBeNull()
    expect(block({ cidrs: [], referrerHosts: [] })).toBeNull()
  })
  it('normalises, dedupes and sorts', () => {
    expect(block({ cidrs: ['10.9.9.9/8', '10.0.0.0/8', '1.1.1.1'], referrerHosts: ['https://Spam.Example.com/x', '*.spam.example.com', 'a.io'] })).toEqual({
      cidrs: ['1.1.1.1', '10.0.0.0/8'],
      referrerHosts: ['a.io', 'spam.example.com'],
    })
  })
  it('rejects invalid entries and oversize lists', () => {
    expect(parseVisitorBlock({ cidrs: ['nope'] }).ok).toBe(false)
    expect(parseVisitorBlock({ referrerHosts: ['localhost'] }).ok).toBe(false)
    expect(parseVisitorBlock({ referrerHosts: [5] }).ok).toBe(false)
    expect(parseVisitorBlock([]).ok).toBe(false)
    expect(parseVisitorBlock({ cidrs: Array(101).fill('1.1.1.1') }).ok).toBe(false)
  })
})

describe('evaluateVisitorBlock', () => {
  const b = block({ cidrs: ['203.0.113.0/24', '2001:db8::/32'], referrerHosts: ['bad.example'] })
  it('blocks IPs inside ranges only', () => {
    expect(evaluateVisitorBlock(b, { ip: '203.0.113.200' })).toBe('ip')
    expect(evaluateVisitorBlock(b, { ip: '203.0.114.1' })).toBeNull()
    expect(evaluateVisitorBlock(b, { ip: '2001:db8:ffff::1' })).toBe('ip')
    expect(evaluateVisitorBlock(b, { ip: '2001:db9::1' })).toBeNull()
    expect(evaluateVisitorBlock(b, { ip: '::ffff:203.0.113.5' })).toBe('ip')
  })
  it('matches hex-form mapped IPv4, bracketed and zoned addresses', () => {
    expect(evaluateVisitorBlock(b, { ip: '::ffff:cb00:7105' })).toBe('ip')
    expect(evaluateVisitorBlock(b, { ip: '[2001:db8::5]' })).toBe('ip')
    expect(evaluateVisitorBlock(b, { ip: 'fe80::1%eth0' })).toBeNull()
    expect(evaluateVisitorBlock(b, { ip: 'not-an-ip' })).toBeNull()
  })
  it('blocks referrer host and subdomains, not lookalikes', () => {
    expect(evaluateVisitorBlock(b, { referer: 'https://bad.example/page' })).toBe('referrer')
    expect(evaluateVisitorBlock(b, { referer: 'https://x.bad.example/' })).toBe('referrer')
    expect(evaluateVisitorBlock(b, { referer: 'https://notbad.example/' })).toBeNull()
    expect(evaluateVisitorBlock(b, { referer: 'garbage' })).toBeNull()
  })
  it('passes when no block, unknown ip, or missing headers', () => {
    expect(evaluateVisitorBlock(null, { ip: '1.1.1.1' })).toBeNull()
    expect(evaluateVisitorBlock(b, { ip: 'unknown' })).toBeNull()
    expect(evaluateVisitorBlock(b, {})).toBeNull()
  })
  it('/0 blocks everything of that family', () => {
    const all = block({ cidrs: ['0.0.0.0/0'] })
    expect(evaluateVisitorBlock(all, { ip: '8.8.8.8' })).toBe('ip')
  })
})
