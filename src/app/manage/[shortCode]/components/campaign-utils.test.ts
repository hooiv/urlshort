import { describe, expect, it } from 'vitest'
import {
  buildPreviewPayload,
  buildRulePayload,
  buildShortUrl,
  buildUtmUrl,
  findLiveRevision,
  findRollbackTarget,
  isHttpUrl,
  normalizeNewTag,
  parseExpirationInput,
  parseMaxClicks,
  parseRuleNumber,
  toDatetimeLocalValue,
} from '@/app/manage/[shortCode]/components/campaign-utils'
import { emptyForm } from '@/app/manage/[shortCode]/components/campaign-types'

describe('isHttpUrl', () => {
  it('accepts http and https URLs', () => {
    expect(isHttpUrl('https://example.com/a')).toBe(true)
    expect(isHttpUrl('http://example.com')).toBe(true)
  })

  it('rejects dangerous and non-absolute URLs', () => {
    expect(isHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isHttpUrl('ftp://example.com')).toBe(false)
    expect(isHttpUrl('not a url')).toBe(false)
    expect(isHttpUrl('')).toBe(false)
  })
})

describe('findLiveRevision', () => {
  const revisions = [
    { id: 'old', destinationUrl: 'https://old.example', reason: null, effectiveAt: '2024-01-01T00:00:00.000Z' },
    { id: 'new', destinationUrl: 'https://new.example', reason: null, effectiveAt: '2024-06-01T00:00:00.000Z' },
    { id: 'future', destinationUrl: 'https://future.example', reason: null, effectiveAt: '2099-01-01T00:00:00.000Z' },
  ]

  it('picks the newest effective revision regardless of input order', () => {
    const now = new Date('2025-01-01T00:00:00.000Z').getTime()
    expect(findLiveRevision([...revisions].reverse(), now)?.id).toBe('new')
    expect(findLiveRevision(revisions, now)?.id).toBe('new')
  })

  it('ignores future scheduled releases and invalid dates', () => {
    const now = new Date('2024-03-01T00:00:00.000Z').getTime()
    expect(findLiveRevision(revisions, now)?.id).toBe('old')
    const withBad = [...revisions, { id: 'bad', destinationUrl: 'x', reason: null, effectiveAt: 'nope' }]
    expect(findLiveRevision(withBad, now)?.id).toBe('old')
  })

  it('returns undefined when nothing is live yet', () => {
    expect(findLiveRevision(revisions, new Date('2020-01-01T00:00:00.000Z').getTime())).toBeUndefined()
    expect(findLiveRevision([], Date.now())).toBeUndefined()
  })
})

describe('findRollbackTarget', () => {
  it('returns the newest revision strictly older than live, skipping futures', () => {
    const revisions = [
      { id: 'future', destinationUrl: 'f', reason: null, effectiveAt: '2099-01-01T00:00:00.000Z' },
      { id: 'live', destinationUrl: 'l', reason: null, effectiveAt: '2024-06-01T00:00:00.000Z' },
      { id: 'prev', destinationUrl: 'p', reason: null, effectiveAt: '2024-05-01T00:00:00.000Z' },
      { id: 'oldest', destinationUrl: 'o', reason: null, effectiveAt: '2024-01-01T00:00:00.000Z' },
    ]
    // A naive filter(id !== live)[0] would pick the future release; the correct
    // target is the true predecessor.
    expect(revisions.filter((r) => r.id !== 'live')[0]?.id).toBe('future')
    expect(findRollbackTarget(revisions, 'live')?.id).toBe('prev')
  })

  it('returns undefined when there is no predecessor or no live revision', () => {
    const single = [{ id: 'only', destinationUrl: 'o', reason: null, effectiveAt: '2024-01-01T00:00:00.000Z' }]
    expect(findRollbackTarget(single, 'only')).toBeUndefined()
    expect(findRollbackTarget(single, 'missing')).toBeUndefined()
  })
})

describe('parseRuleNumber', () => {
  it('accepts range boundaries', () => {
    expect(parseRuleNumber('0', 'Priority', 0, 10000)).toBe(0)
    expect(parseRuleNumber('10000', 'Priority', 0, 10000)).toBe(10000)
    expect(parseRuleNumber('1000', 'Weight', 0, 1000)).toBe(1000)
  })

  it('rejects empty, NaN, fractional, and out-of-range input', () => {
    for (const raw of ['', 'abc', '1.5', '-1', '10001']) {
      expect(() => parseRuleNumber(raw, 'Priority', 0, 10000)).toThrow('Priority must be 0–10000')
    }
    expect(() => parseRuleNumber('1001', 'Weight', 0, 1000)).toThrow('Weight must be 0–1000')
  })
})

describe('buildRulePayload', () => {
  it('maps the form to the API shape with numbers, nulls, and ISO dates', () => {
    const payload = buildRulePayload({
      ...emptyForm,
      name: '  iOS variant ',
      destinationUrl: 'https://example.com/ios',
      priority: '10',
      weight: '50',
      countryCodes: 'US, GB',
      deviceType: 'mobile',
      startAt: '2024-01-01T00:00',
      endAt: '2024-02-01T00:00',
    })
    expect(payload).toMatchObject({
      name: 'iOS variant',
      destinationUrl: 'https://example.com/ios',
      priority: 10,
      weight: 50,
      countryCodes: 'US, GB',
      deviceType: 'mobile',
      trafficType: null,
      aiAgent: null,
      os: null,
      languageCodes: null,
    })
    expect(typeof payload.startAt).toBe('string')
    expect(typeof payload.endAt).toBe('string')
  })

  it('emits null schedule bounds when unset', () => {
    const payload = buildRulePayload({ ...emptyForm, name: 'n', destinationUrl: 'https://example.com' })
    expect(payload.startAt).toBeNull()
    expect(payload.endAt).toBeNull()
  })

  it('rejects missing names, bad URLs, bad numbers, and inverted windows', () => {
    expect(() => buildRulePayload({ ...emptyForm, destinationUrl: 'https://example.com' })).toThrow()
    expect(() => buildRulePayload({ ...emptyForm, name: 'n', destinationUrl: 'notaurl' })).toThrow('Enter a valid URL')
    expect(() => buildRulePayload({ ...emptyForm, name: 'n', destinationUrl: 'https://example.com', priority: '' })).toThrow()
    expect(() =>
      buildRulePayload({
        ...emptyForm,
        name: 'n',
        destinationUrl: 'https://example.com',
        startAt: '2024-02-01T00:00',
        endAt: '2024-01-01T00:00',
      }),
    ).toThrow('End time must be after start time')
  })
})

describe('parseMaxClicks', () => {
  it('returns null for blank input (limit cleared)', () => {
    expect(parseMaxClicks('')).toBeNull()
    expect(parseMaxClicks('   ')).toBeNull()
  })

  it('accepts positive integers', () => {
    expect(parseMaxClicks('500')).toBe(500)
  })

  it('rejects zero, fractions, and non-numeric input', () => {
    for (const raw of ['0', '-3', '1.5', 'abc']) {
      expect(() => parseMaxClicks(raw)).toThrow('Max clicks must be a positive integer')
    }
  })
})

describe('parseExpirationInput', () => {
  it('converts datetime-local values to ISO strings', () => {
    const iso = parseExpirationInput('2025-01-02T03:04')
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })

  it('returns null for empty input and throws for garbage', () => {
    expect(parseExpirationInput('')).toBeNull()
    expect(() => parseExpirationInput('not-a-date')).toThrow('Invalid expiration date')
  })
})

describe('normalizeNewTag', () => {
  it('trims and lowercases new tags', () => {
    expect(normalizeNewTag('  Summer_Promo ', [])).toBe('summer_promo')
  })

  it('returns null for blanks and duplicates', () => {
    expect(normalizeNewTag('   ', [])).toBeNull()
    expect(normalizeNewTag('news', ['news'])).toBeNull()
    expect(normalizeNewTag('News', ['news'])).toBeNull()
  })

  it('rejects values the server would drop', () => {
    expect(() => normalizeNewTag('!!!', [])).toThrow()
    expect(() => normalizeNewTag('a'.repeat(33), [])).toThrow()
  })
})

describe('buildPreviewPayload', () => {
  it('normalizes country, language, and referrer casing', () => {
    expect(
      buildPreviewPayload({ country: ' us ', deviceType: 'desktop', os: 'windows', language: 'EN', trafficType: 'human', aiAgent: '', referrerHost: ' Instagram.com ' }),
    ).toMatchObject({ country: 'US', language: 'en', referrerHost: 'instagram.com' })
  })

  it('rejects invalid country, language, and referrer values', () => {
    const base = { country: 'US', deviceType: 'desktop', os: 'windows', language: 'en', trafficType: 'human', aiAgent: '', referrerHost: '' }
    expect(() => buildPreviewPayload({ ...base, country: 'USA' })).toThrow('Country must be an ISO 2-letter code')
    expect(() => buildPreviewPayload({ ...base, language: 'e' })).toThrow('Invalid language code')
    expect(() => buildPreviewPayload({ ...base, referrerHost: 'not a host!' })).toThrow('Invalid referrer host')
  })
})

describe('URL builders', () => {
  it('builds short URLs with and without an origin', () => {
    expect(buildShortUrl('https://sho.rt', 'abc')).toBe('https://sho.rt/abc')
    expect(buildShortUrl('', 'abc')).toBe('/abc')
  })

  it('builds UTM URLs with trimmed, encoded params', () => {
    expect(buildUtmUrl('https://sho.rt', 'abc', { source: ' google ', medium: 'cpc', campaign: 'summer sale' })).toBe(
      'https://sho.rt/abc?utm_source=google&utm_medium=cpc&utm_campaign=summer+sale',
    )
    expect(buildUtmUrl('', 'abc', { source: '', medium: '', campaign: '' })).toBe('/abc')
  })
})

describe('toDatetimeLocalValue', () => {
  it('formats ISO timestamps for datetime-local inputs', () => {
    expect(toDatetimeLocalValue('2025-01-02T03:04:05.000Z')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  })

  it('returns empty string for missing or invalid input', () => {
    expect(toDatetimeLocalValue(null)).toBe('')
    expect(toDatetimeLocalValue(undefined)).toBe('')
    expect(toDatetimeLocalValue('garbage')).toBe('')
  })
})
