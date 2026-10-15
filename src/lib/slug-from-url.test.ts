import { describe, expect, it } from 'vitest'
import { suggestSlugsFromUrl } from './slug-from-url'

describe('suggestSlugsFromUrl', () => {
  it('builds readable codes from path and brand', () => {
    const s = suggestSlugsFromUrl('https://www.example.com/blog/spring-sale-2026-collection')
    expect(s[0]).toBe('spring-sale-2026')
    expect(s).toContain('example-spring')
    expect(s).toContain('example')
  })
  it('handles co.uk hosts and percent encoding', () => {
    const s = suggestSlugsFromUrl('https://shop.acme.co.uk/Caf%C3%A9-menu')
    expect(s[0]).toBe('cafe-menu')
    expect(s).toContain('acme-cafe')
  })
  it('returns [] for invalid or non-http urls', () => {
    expect(suggestSlugsFromUrl('not a url')).toEqual([])
    expect(suggestSlugsFromUrl('javascript:alert(1)')).toEqual([])
  })
  it('skips reserved words and respects limit and charset', () => {
    const s = suggestSlugsFromUrl('https://x.com/api', 2)
    for (const c of s) expect(c).toMatch(/^[a-z0-9-]{3,24}$/)
    expect(s.length).toBeLessThanOrEqual(2)
  })
  it('survives malformed escapes', () => {
    expect(() => suggestSlugsFromUrl('https://a.com/%E0%A4%A-deal')).not.toThrow()
  })
})
