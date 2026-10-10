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

describe('previewUtmTemplate', () => {
  it('normalizes the draft and tags the url', async () => {
    const { previewUtmTemplate } = await import('./utm-templates')
    expect(previewUtmTemplate('https://example.com/a', { source: 'News Letter', medium: 'Email' })).toEqual({ url: 'https://example.com/a?utm_source=news-letter&utm_medium=email' })
  })
  it('returns an error rather than throwing for an empty draft', async () => {
    const { previewUtmTemplate } = await import('./utm-templates')
    expect(previewUtmTemplate('https://example.com', { source: '  ' })).toEqual({ error: 'A template needs at least one UTM value' })
  })
})

describe('applyUtmTemplate edge cases', () => {
  it('keeps hash fragments and existing utm params', async () => {
    const { applyUtmTemplate } = await import('./utm-templates')
    const out = applyUtmTemplate('https://a.com/p?utm_source=x#frag', { source: 'y', medium: 'email' })
    expect(out).toContain('utm_source=x')
    expect(out).toContain('utm_medium=email')
    expect(out.endsWith('#frag')).toBe(true)
  })
  it('leaves non-http urls unchanged', async () => {
    const { applyUtmTemplate } = await import('./utm-templates')
    expect(applyUtmTemplate('mailto:a@b.com', { source: 'y' })).toBe('mailto:a@b.com')
  })
})

describe('applyUtmTemplate blank params', () => {
  it('fills a blank existing utm param instead of leaving it empty', async () => {
    const { applyUtmTemplate } = await import('./utm-templates')
    const u = new URL(applyUtmTemplate('https://a.com/?utm_source=&utm_medium=cpc', { source: 'news', medium: 'email' }))
    expect(u.searchParams.getAll('utm_source')).toEqual(['news'])
    expect(u.searchParams.get('utm_medium')).toBe('cpc')
  })
})
