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
