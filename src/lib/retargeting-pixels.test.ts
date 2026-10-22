import { describe, expect, it } from 'vitest'
import {
  activePixels, isValidPixelId, normalizePixelId, pixelConsentGranted,
  renderPixelRedirectPage, scriptLiteral, PixelValidationError,
} from './retargeting-pixels'

describe('pixel id validation', () => {
  it('accepts well-formed ids', () => {
    expect(isValidPixelId('meta', '123456789012345')).toBe(true)
    expect(isValidPixelId('google', 'G-ABC123XYZ9')).toBe(true)
    expect(isValidPixelId('google', 'AW-123456789/AbC-defGHI')).toBe(true)
    expect(isValidPixelId('x', 'o1abc')).toBe(true)
    expect(isValidPixelId('linkedin', '1234567')).toBe(true)
    expect(isValidPixelId('tiktok', 'C4ABCDEF1234567890')).toBe(true)
    expect(isValidPixelId('pinterest', '2612345678901')).toBe(true)
    expect(isValidPixelId('pinterest', "1');alert(1)//")).toBe(false)
    expect(isValidPixelId('pinterest', '12')).toBe(false)
    expect(isValidPixelId('reddit', 'a2_abc123def456')).toBe(true)
    expect(isValidPixelId('reddit', "a');alert(1)//")).toBe(false)
    expect(isValidPixelId('reddit', 'ab')).toBe(false)
    expect(isValidPixelId('snapchat', '12345678-abcd-4ef0-9876-1234567890ab')).toBe(true)
    expect(isValidPixelId('snapchat', "1');alert(1)//")).toBe(false)
    expect(isValidPixelId('snapchat', '12345678')).toBe(false)
  })
  it('rejects injection attempts', () => {
    expect(isValidPixelId('meta', "1');alert(1)//")).toBe(false)
    expect(isValidPixelId('google', 'G-ABCD"></script>')).toBe(false)
    expect(isValidPixelId('tiktok', "x'+alert(1)+'")).toBe(false)
  })
  it('normalizes empty to null and throws on bad', () => {
    expect(normalizePixelId('meta', '  ')).toBeNull()
    expect(normalizePixelId('meta', undefined)).toBeNull()
    expect(normalizePixelId('linkedin', ' 123456 ')).toBe('123456')
    expect(() => normalizePixelId('linkedin', 'abc')).toThrow(PixelValidationError)
    expect(() => normalizePixelId('meta', 5)).toThrow(/string/)
  })
  it('activePixels drops invalid stored values', () => {
    expect(activePixels({ metaPixelId: 'bad', tiktokPixelId: 'C4ABCDEF1234567890', linkedinPartnerId: '123456' }).map((p) => p.provider))
      .toEqual(['linkedin', 'tiktok'])
  })
})

describe('consent', () => {
  it('allows with no signals', () => expect(pixelConsentGranted({})).toBe(true))
  it('blocks on GPC and DNT', () => {
    expect(pixelConsentGranted({ gpc: '1' })).toBe(false)
    expect(pixelConsentGranted({ dnt: '1' })).toBe(false)
  })
  it('blocks on explicit opt-out cookie only', () => {
    expect(pixelConsentGranted({ cookie: 'a=b; ql_consent=denied' })).toBe(false)
    expect(pixelConsentGranted({ cookie: 'ql_consent=0' })).toBe(false)
    expect(pixelConsentGranted({ cookie: 'ql_consent=granted' })).toBe(true)
    expect(pixelConsentGranted({ cookie: 'other_ql_consent=0' })).toBe(true)
  })
})

describe('render', () => {
  const pixels = activePixels({ metaPixelId: '123456789012', googleTagId: 'G-ABCD1234', xPixelId: 'o1abc', linkedinPartnerId: '123456', tiktokPixelId: 'C4ABCDEF1234567890', pinterestTagId: '2612345678901', snapPixelId: '12345678-abcd-4ef0-9876-1234567890ab' })
  it('includes every provider and redirects within the cap', () => {
    const html = renderPixelRedirectPage({ destination: 'https://example.com/a?b=1&c=2', pixels })
    for (const needle of ['fbq(', 'gtag(', 'twq(', '_linkedin_data_partner_ids', 'ttq.load(', "pintrk('load',\"2612345678901\")", "snaptr('init',\"12345678-abcd-4ef0-9876-1234567890ab\")"]) expect(html).toContain(needle)
    expect(html).toContain('setTimeout(go,250)')
    expect(html).not.toContain('Redirecting')
    expect(html).toContain('<noscript><meta http-equiv="refresh" content="0; url=https://example.com/a?b=1&amp;c=2">')
  })
  it('clamps wait and escapes hostile destinations', () => {
    const html = renderPixelRedirectPage({ destination: 'https://e.com/</script><script>alert(1)</script>', pixels: [], maxWaitMs: 99999 })
    expect(html).toContain('setTimeout(go,1000)')
    expect(html).not.toContain('</script><script>alert')
  })
  it('scriptLiteral neutralises breakout characters', () => {
    expect(scriptLiteral('</script>&\u2028')).not.toMatch(/[<>&\u2028]/)
  })
})
