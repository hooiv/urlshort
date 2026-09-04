import { describe, expect, it } from 'vitest'
import {
  buildShortenPayload,
  isFutureExpiresAt,
  isSafeHttpUrl,
  parseMaxClicks,
  parseTagsInput,
  validateShortenInput,
  withUtmParams,
  emptyShortenForm,
  normalizeSplitRules,
} from './shorten-logic'

describe('isSafeHttpUrl', () => {
  it('accepts http/https and schemeless hostnames', () => {
    expect(isSafeHttpUrl('https://example.com/a')).toBe(true)
    expect(isSafeHttpUrl('http://example.com')).toBe(true)
    expect(isSafeHttpUrl('example.com/landing')).toBe(true)
  })

  it('rejects dangerous schemes', () => {
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeHttpUrl('data:text/html,hi')).toBe(false)
    expect(isSafeHttpUrl('file:///etc/passwd')).toBe(false)
    expect(isSafeHttpUrl('vbscript:msgbox(1)')).toBe(false)
    expect(isSafeHttpUrl('')).toBe(false)
  })
})

describe('withUtmParams', () => {
  it('appends provided utm params and preserves existing query', () => {
    const out = withUtmParams('https://example.com/?a=1', {
      utmSource: 'google',
      utmMedium: 'cpc',
      utmCampaign: 'summer',
      utmTerm: '',
      utmContent: '',
    })
    expect(out).toContain('a=1')
    expect(out).toContain('utm_source=google')
    expect(out).toContain('utm_medium=cpc')
    expect(out).toContain('utm_campaign=summer')
  })

  it('returns the input unchanged when there are no utm values or the URL is invalid', () => {
    expect(
      withUtmParams('https://example.com', {
        utmSource: '',
        utmMedium: '',
        utmCampaign: '',
        utmTerm: '',
        utmContent: '',
      }),
    ).toBe('https://example.com')
    expect(
      withUtmParams('not a url !!!', {
        utmSource: 'x',
        utmMedium: '',
        utmCampaign: '',
        utmTerm: '',
        utmContent: '',
      }),
    ).toBe('not a url !!!')
  })
})

describe('parseTagsInput', () => {
  it('splits on commas and drops empties', () => {
    expect(parseTagsInput('marketing, launch,, paid-ads ')).toEqual(['marketing', 'launch', 'paid-ads'])
    expect(parseTagsInput('')).toEqual([])
  })
})

describe('parseMaxClicks', () => {
  it('parses positive integers and rejects the rest', () => {
    expect(parseMaxClicks('100')).toBe(100)
    expect(parseMaxClicks('')).toBeUndefined()
    expect(parseMaxClicks('0')).toBeUndefined()
    expect(parseMaxClicks('-5')).toBeUndefined()
    expect(parseMaxClicks('abc')).toBeUndefined()
  })
})

describe('isFutureExpiresAt', () => {
  it('accepts empty and future dates, rejects past and invalid', () => {
    expect(isFutureExpiresAt('')).toBe(true)
    expect(isFutureExpiresAt(new Date(Date.now() + 3600_000).toISOString())).toBe(true)
    expect(isFutureExpiresAt('2000-01-01T00:00')).toBe(false)
    expect(isFutureExpiresAt('not-a-date')).toBe(false)
  })
})

describe('normalizeSplitRules', () => {
  it('drops empty urls and trims the rest', () => {
    expect(normalizeSplitRules([{ id: 1, url: '  ', weight: 50 }])).toEqual([])
    expect(normalizeSplitRules([{ id: 1, url: ' https://b.example ', weight: 30 }])).toEqual([
      { url: 'https://b.example', weight: 30 },
    ])
  })
})

describe('validateShortenInput', () => {
  it('requires a safe destination and validates optional fields', () => {
    const base = emptyShortenForm()
    expect(validateShortenInput(base)).toBe('Enter a destination URL')
    expect(validateShortenInput({ ...base, url: 'javascript:alert(1)' })).toBe(
      'Destination must be an http(s) URL',
    )
    expect(validateShortenInput({ ...base, url: 'https://ok.example', maxClicks: '0' })).toBe(
      'Max clicks must be a positive integer',
    )
    expect(
      validateShortenInput({ ...base, url: 'https://ok.example', expiresAt: '2000-01-01T00:00' }),
    ).toBe('Expiration date must be in the future')
    expect(
      validateShortenInput({
        ...base,
        url: 'https://ok.example',
        splitRules: [{ id: 1, url: 'https://b.example', weight: 5000 }],
      }),
    ).toBe('A/B variant weight must be an integer from 0 to 1000')
    expect(validateShortenInput({ ...base, url: 'https://ok.example' })).toBeNull()
  })
})

describe('buildShortenPayload', () => {
  it('builds the /api/shorten body with the same shape as before', () => {
    const payload = buildShortenPayload({
      ...emptyShortenForm(),
      url: 'https://example.com/landing',
      customCode: ' spring-sale ',
      tags: 'marketing, launch,',
      maxClicks: '100',
      cloaked: true,
      utmSource: 'google',
      utmMedium: 'cpc',
      utmCampaign: 'search',
      utmTerm: '',
      utmContent: '',
      splitRules: [{ id: 1, url: ' https://b.example ', weight: 50 }],
    })
    expect(payload.url).toContain('utm_source=google')
    expect(payload.customCode).toBe('spring-sale')
    expect(payload.tags).toEqual(['marketing', 'launch'])
    expect(payload.maxClicks).toBe(100)
    expect(payload.cloaked).toBe(true)
    expect(payload.splitRules).toEqual([{ url: 'https://b.example', weight: 50 }])
  })
})
