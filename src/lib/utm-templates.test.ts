import { describe, expect, it } from 'vitest'
import { applyUtmTemplate, normalizeUtmTemplateName, normalizeUtmValue, normalizeUtmValues } from './utm-templates'

describe('utm templates', () => {
  it('normalizes values', () => {
    expect(normalizeUtmValue('  Spring  Sale ')).toBe('spring-sale')
    expect(normalizeUtmValue('   ')).toBeNull()
    expect(normalizeUtmValue(undefined)).toBeNull()
    expect(() => normalizeUtmValue('a\x01b')).toThrow(/control/)
    expect(() => normalizeUtmValue('x'.repeat(121))).toThrow(/120/)
  })
  it('requires a value and a name', () => {
    expect(() => normalizeUtmValues({})).toThrow(/at least one/)
    expect(normalizeUtmValues({ source: 'News Letter' }).source).toBe('news-letter')
    expect(() => normalizeUtmTemplateName('  ')).toThrow()
    expect(normalizeUtmTemplateName(' a   b ')).toBe('a b')
  })
  it('appends missing params and keeps existing utm_* and other query', () => {
    const out = new URL(applyUtmTemplate('https://e.com/p?x=1&utm_source=keep', { source: 'new', medium: 'email', campaign: null }))
    expect(out.searchParams.get('utm_source')).toBe('keep')
    expect(out.searchParams.get('utm_medium')).toBe('email')
    expect(out.searchParams.get('x')).toBe('1')
    expect(out.searchParams.has('utm_campaign')).toBe(false)
  })
  it('leaves non-http and invalid URLs alone', () => {
    expect(applyUtmTemplate('mailto:a@b.c', { source: 'x' })).toBe('mailto:a@b.c')
    expect(applyUtmTemplate('not a url', { source: 'x' })).toBe('not a url')
  })
})
