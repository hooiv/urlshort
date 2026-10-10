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

  it('flags non-standard ports and script/launcher files', () => {
    expect(assessDestination('https://example.com:8443/x').reason).toMatch(/port/i)
    expect(assessDestination('https://example.com/run.ps1').reason).toMatch(/script/i)
    expect(assessDestination('https://example.com/a.lnk?x=1').status).toBe('review')
    expect(assessDestination('https://example.com:443/x').status).toBe('cleared')
  })
})

describe('more chained shorteners', () => {
  it.each(['https://tiny.cc/x', 'https://www.bit.ly/x', 'https://lnkd.in/abc', 'https://dub.sh/a'])('flags %s', (u) => {
    expect(assessDestination(u).reason).toMatch(/Chained link-shortener/)
  })
  it('does not flag lookalike suffix hosts', () => {
    expect(assessDestination('https://notbit.ly.example.org/x').reason ?? '').not.toMatch(/Chained/)
  })
})

describe('encoded and numeric tricks', () => {
  it('flags percent-encoded control characters', () => {
    expect(assessDestination('https://example.com/a%0d%0aSet-Cookie:x').status).toBe('review')
    expect(assessDestination('https://example.com/a%7f').status).toBe('review')
  })
  it('does not flag ordinary encoded text', () => {
    expect(assessDestination('https://example.com/caf%C3%A9?q=a%20b').status).toBe('cleared')
  })
  it('flags numeric-only hosts that are not valid IPs', () => {
    expect(assessDestination('https://999.999.999.999/').status).toBe('review')
  })
})

describe('double encoding and archives', () => {
  it('flags double-encoded characters', () => {
    expect(assessDestination('https://example.com/a%252e%252e/b').reason).toMatch(/Double-encoded/)
  })
  it('flags archive and macro downloads', () => {
    expect(assessDestination('https://example.com/invoice.zip').reason).toMatch(/Archive/)
    expect(assessDestination('https://example.com/q.docm').status).toBe('review')
  })
  it('does not flag a literal percent sign followed by plain text', () => {
    expect(assessDestination('https://example.com/zip-codes?q=50%25off').status).toBe('cleared')
  })
})

describe('deep subdomains and script-scheme params', () => {
  it('flags 7+ label hosts', () => {
    expect(assessDestination('https://a.b.c.d.e.f.example.com/').reason).toContain('deep subdomain')
    expect(assessDestination('https://a.b.example.com/').status).toBe('cleared')
  })
  it('flags javascript:/data: query values', () => {
    expect(assessDestination('https://example.com/x?cb=javascript:alert(1)').reason).toContain('payload')
    expect(assessDestination('https://example.com/x?v=data:text/html,hi').status).toBe('review')
    expect(assessDestination('https://example.com/x?v=metadata:1').status).toBe('cleared')
  })

  it('flags unusually long URLs', () => {
    const r = assessDestination('https://example.com/?q=' + 'a'.repeat(2100))
    expect(r.status).toBe('review')
    expect(r.reason).toMatch(/long URL/)
  })

  it('flags trailing-dot hostnames', () => {
    const r = assessDestination('https://example.com./x')
    expect(r.status).toBe('review')
    expect(r.reason).toMatch(/Malformed hostname/)
  })
})
