import { describe, expect, it } from 'vitest'
import { buildOgMetaTags, validateOgFields, validateOgImageUrl } from './og-preview'

describe('og-preview', () => {
  it('accepts https images and rejects unsafe ones', () => {
    expect(validateOgImageUrl('https://cdn.x.com/a.png')).toBe('https://cdn.x.com/a.png')
    expect(validateOgImageUrl('  ')).toBeNull()
    expect(() => validateOgImageUrl('javascript:alert(1)')).toThrow()
    expect(() => validateOgImageUrl('http://evil.com/a.png')).toThrow(/https/)
    expect(() => validateOgImageUrl('https://u:p@x.com/a.png')).toThrow(/credentials/)
    expect(() => validateOgImageUrl('/rel.png')).toThrow(/absolute/)
    expect(validateOgImageUrl('http://localhost:3000/a.png')).toBeTruthy()
  })
  it('validates fields and only returns provided keys', () => {
    expect(validateOgFields({})).toEqual({})
    expect(validateOgFields({ title: ' Hi\n there ', description: '' })).toEqual({ title: 'Hi there', description: null })
    expect(() => validateOgFields({ title: 'x'.repeat(201) })).toThrow()
    expect(() => validateOgFields({ description: 5 })).toThrow()
  })
  it('escapes meta output and omits empty description', () => {
    const h = buildOgMetaTags({ title: '<b>"x"</b>', description: null, image: 'https://a.com/i.png?a=1&b=2', canonical: 'https://d.com' })
    expect(h).not.toContain('<b>')
    expect(h).toContain('&amp;b=2')
    expect(h).not.toContain('og:description')
    expect(buildOgMetaTags({ title: 't', description: 'd"', image: 'https://a.com/i', canonical: 'https://d.com' })).toContain('twitter:description')
  })
})

import { describe as d2, it as i2, expect as e2 } from 'vitest'
import { validateOgFields as v2, buildOgMetaTags as b2 } from './og-preview'

d2('og-preview extra', () => {
  i2('clears fields with empty string and rejects javascript/credential URLs', () => {
    e2(v2({ title: '  ', description: null })).toEqual({ title: null, description: null })
    e2(() => v2({ ogImage: 'javascript:alert(1)' })).toThrow()
    e2(() => v2({ ogImage: 'https://u:p@x.com/a.png' })).toThrow(/credentials/)
    e2(() => v2({ title: 5 })).toThrow(/string/)
  })
  i2('escapes quotes in rendered tags and omits description tags when absent', () => {
    const html = b2({ title: '"><script>', description: null, image: 'https://x.com/a.png?a=1&b=2', canonical: 'https://d.com' })
    e2(html).not.toContain('<script>')
    e2(html).not.toContain('og:description')
    e2(html).toContain('&amp;b=2')
  })
})
