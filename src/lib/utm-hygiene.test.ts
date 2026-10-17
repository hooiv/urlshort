import { describe, expect, it } from 'vitest'
import { lintUtm, normalizeUtmValue, parseUtmHygieneLimit } from './utm-hygiene'

describe('utm hygiene', () => {
  it('normalizes values', () => {
    expect(normalizeUtmValue('  Spring Sale  2026 ')).toBe('spring-sale-2026')
  })
  it('flags uppercase and whitespace and fixes the URL', () => {
    const r = lintUtm('https://a.com/p?utm_source=Facebook&utm_campaign=spring%20sale&x=Keep')!
    expect(r.issues.map((i) => i.reason)).toEqual(['uppercase', 'whitespace'])
    expect(r.fixedUrl).toBe('https://a.com/p?utm_source=facebook&utm_campaign=spring-sale&x=Keep')
  })
  it('flags duplicate keys and drops extras', () => {
    const r = lintUtm('https://a.com/?utm_source=a&utm_source=b')!
    expect(r.issues[0].reason).toBe('duplicate-key')
    expect(r.fixedUrl).toBe('https://a.com/?utm_source=a')
  })
  it('returns null for clean or invalid URLs', () => {
    expect(lintUtm('https://a.com/?utm_source=x')).toBeNull()
    expect(lintUtm('nope')).toBeNull()
  })
  it('detects uppercase key names', () => {
    const r = lintUtm('https://a.com/?UTM_Source=x')!
    expect(r.fixedUrl).toBe('https://a.com/?utm_source=x')
  })
  it('parses limits', () => {
    expect(parseUtmHygieneLimit(null)).toBe(50)
    expect(parseUtmHygieneLimit('0')).toBeNull()
    expect(parseUtmHygieneLimit('201')).toBeNull()
    expect(parseUtmHygieneLimit('abc')).toBeNull()
  })
  it('keeps untouched params byte-for-byte and the fragment', () => {
    const r = lintUtm('https://a.com/p?x=a%20b&y=1+2&utm_source=Fb#top')!
    expect(r.fixedUrl).toBe('https://a.com/p?x=a%20b&y=1+2&utm_source=fb#top')
  })
  it('treats plus as a space in utm values', () => {
    const r = lintUtm('https://a.com/?utm_campaign=spring+sale')!
    expect(r.fixedUrl).toBe('https://a.com/?utm_campaign=spring-sale')
  })
  it('ignores malformed percent-encoding instead of throwing', () => {
    expect(lintUtm('https://a.com/?utm_source=%E0%A4%A')).toBeNull()
  })
})
