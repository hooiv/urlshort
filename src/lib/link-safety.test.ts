import { describe, expect, it } from 'vitest'
import { assessDestination } from './link-safety'

describe('assessDestination', () => {
  it('clears an ordinary https destination', () => {
    expect(assessDestination('https://example.com/blog/hello')).toEqual({ status: 'cleared', reason: null })
  })

  it('flags non-http(s) protocols instead of clearing them', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,<h1>x</h1>', 'file:///etc/passwd', 'ftp://example.com/f']) {
      const result = assessDestination(url)
      expect(result.status).toBe('review')
      expect(result.reason).toMatch(/protocol/i)
    }
  })

  it('flags credential-bearing destinations', () => {
    const result = assessDestination('https://user:pass@example.com/')
    expect(result.status).toBe('review')
    expect(result.reason).toMatch(/credential/i)
  })

  it('flags executables hidden behind query, fragment, or trailing slash', () => {
    for (const url of [
      'https://example.com/dl?file=setup.exe',
      'https://example.com/setup.exe#run',
      'https://example.com/setup.exe/',
      'https://example.com/setup.msi?x=1',
    ]) {
      expect(assessDestination(url).status).toBe('review')
    }
  })

  it('keeps existing signals (unparsable, http, ip, punycode)', () => {
    expect(assessDestination('not a url').status).toBe('review')
    expect(assessDestination('http://example.com/').reason).toMatch(/unencrypted/i)
    expect(assessDestination('https://1.2.3.4/x').reason).toMatch(/ip-address/i)
    expect(assessDestination('https://xn--exmple-cua.com/').reason).toMatch(/punycode/i)
  })
})

import { detectBrandImpersonation as dbi } from './link-safety'
describe('link-safety heuristics v2', () => {
  it('flags chained shorteners', () => {
    expect(assessDestination('https://bit.ly/abc').reason).toContain('Chained')
  })
  it('flags risky TLDs', () => {
    expect(assessDestination('https://free-gift.zip/').status).toBe('review')
  })
  it('flags brand impersonation incl. look-alikes', () => {
    expect(dbi('paypa1.com')).toBe('paypal')
    expect(dbi('secure-google.example.net')).toBe('google')
    expect(assessDestination('https://login.paypal-support.com/').reason).toContain('paypal')
  })
  it('does not flag legit brand domains', () => {
    expect(dbi('www.paypal.com')).toBeNull()
    expect(assessDestination('https://www.google.com/maps').status).toBe('cleared')
    expect(assessDestination('https://example.com/').status).toBe('cleared')
  })
  it('flags hyphen stuffing', () => {
    expect(assessDestination('https://a-b-c-d-e.example.com/').reason).toContain('hyphen')
  })
  it('accepts brand country domains but not look-alike suffix tricks', () => {
    expect(dbi('www.google.co.uk')).toBeNull()
    expect(dbi('amazon.de')).toBeNull()
    expect(dbi('paypal.com.evil.net')).toBe('paypal')
    expect(dbi('google.com.au')).toBeNull()
  })
  it('treats a trailing-dot host like the bare host', () => {
    expect(assessDestination('https://bit.ly./abc').reason).toContain('Chained')
  })
})

describe('embedded redirect parameters', () => {
  it('flags a redirect parameter pointing at another host', () => {
    const r = assessDestination('https://example.com/out?url=https%3A%2F%2Fevil.example.net%2Fx')
    expect(r.status).toBe('review')
    expect(r.reason).toMatch(/redirect parameter/i)
  })
  it('ignores same-host, relative and non-URL values', () => {
    for (const u of ['https://example.com/a?next=https://example.com/b', 'https://example.com/a?next=/dashboard', 'https://example.com/a?q=shoes', 'https://example.com/a?utm_source=x']) {
      expect(assessDestination(u)).toEqual({ status: 'cleared', reason: null })
    }
  })
  it('ignores non-http inner schemes', () => {
    expect(assessDestination('https://example.com/a?url=mailto:a@b.co').status).toBe('cleared')
  })
})
