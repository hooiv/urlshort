import { describe, expect, it } from 'vitest'
import {
  MAX_FORWARDED_PARAMS,
  escapeHtml,
  forwardQueryParams,
  isBillableTraffic,
  jsString,
  resolveDestination,
} from './redirect'

describe('resolveDestination', () => {
  it('prefers smart rule over campaign, revision, and default', () => {
    expect(
      resolveDestination({
        ruleUrl: 'https://rule.test',
        campaignUrl: 'https://campaign.test',
        revisionUrl: 'https://rev.test',
        fallbackUrl: 'https://default.test',
      })
    ).toBe('https://rule.test')
  })

  it('falls through campaign and revision to the link default', () => {
    expect(
      resolveDestination({
        campaignUrl: 'https://campaign.test',
        fallbackUrl: 'https://default.test',
      })
    ).toBe('https://campaign.test')
    expect(resolveDestination({ fallbackUrl: 'https://default.test' })).toBe('https://default.test')
  })
})

describe('forwardQueryParams', () => {
  it('merges incoming params without overriding destination params', () => {
    const out = new URL(
      forwardQueryParams(
        'https://shop.test/p?utm_source=owner',
        new URLSearchParams('utm_source=evil&utm_medium=cpc&gclid=abc')
      )
    )
    expect(out.searchParams.get('utm_source')).toBe('owner')
    expect(out.searchParams.get('utm_medium')).toBe('cpc')
    expect(out.searchParams.get('gclid')).toBe('abc')
  })

  it('caps forwarded params to bound URL growth', () => {
    const incoming = new URLSearchParams()
    for (let i = 0; i < MAX_FORWARDED_PARAMS + 20; i++) incoming.set(`p${i}`, 'x')
    const out = new URL(forwardQueryParams('https://x.test/', incoming))
    expect([...out.searchParams.keys()].length).toBe(MAX_FORWARDED_PARAMS)
  })

  it('rejects invalid destinations so callers can 404 instead of 503', () => {
    expect(() => forwardQueryParams('not a url', new URLSearchParams('a=b'))).toThrow()
  })
})

describe('isBillableTraffic', () => {
  it('excludes only automated crawler traffic from quota', () => {
    expect(isBillableTraffic('bot')).toBe(false)
    expect(isBillableTraffic('human')).toBe(true)
    expect(isBillableTraffic('ai_agent')).toBe(true)
  })
})

describe('output escaping', () => {
  it('html-escapes attributes and text', () => {
    expect(escapeHtml('"><script>alert(1)</script>')).toBe('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('js-escapes script string literals without breaking out of <script>', () => {
    const escaped = jsString('https://x.test/</script><script>alert(1)</script>')
    // No literal "</script" may survive: `<` is unicode-escaped (`>` is harmless).
    expect(escaped).not.toContain('</script')
    expect(escaped).toContain('\\u003c/script>')
    // Still a valid JS string literal evaluating to the original value.
    expect(JSON.parse(escaped.replace(/\\u003c/g, '<'))).toBe('https://x.test/</script><script>alert(1)</script>')
  })
})
