import { describe, expect, it } from 'vitest'
import { matchDestination, validateLookupUrl } from './link-lookup'

const row = (id: string, originalUrl: string, clicks = 0, isActive = true, day = 1) => ({ id, shortCode: id, title: null, originalUrl, clicks, isActive, createdAt: new Date(Date.UTC(2026, 0, day)) })

describe('link lookup', () => {
  it('validates the url', () => {
    expect(validateLookupUrl(null).ok).toBe(false)
    expect(validateLookupUrl('ftp://x.test').ok).toBe(false)
    expect(validateLookupUrl('x'.repeat(3000)).ok).toBe(false)
    expect(validateLookupUrl(' https://www.Example.com/a ')).toEqual({ ok: true, url: 'https://www.Example.com/a', host: 'example.com' })
  })
  it('matches normalised destinations and ranks exact, active, popular first', () => {
    const q = 'https://example.com/a'
    const out = matchDestination([
      row('inactive', 'https://example.com/a', 99, false),
      row('popular', 'https://www.example.com/a/?utm_source=x', 50),
      row('exact', q, 1, true, 5),
      row('other', 'https://example.com/b', 500),
      row('bad', 'nope'),
    ], q)
    expect(out.map((m) => m.shortCode)).toEqual(['exact', 'inactive', 'popular'])
    expect(out[0].exact).toBe(true)
    expect(out[2].exact).toBe(false)
  })
  it('returns nothing for an unparseable query and honours the limit', () => {
    expect(matchDestination([row('a', 'https://x.test')], 'nope')).toEqual([])
    expect(matchDestination([row('a', 'https://x.test'), row('b', 'https://x.test/')], 'https://x.test', 1)).toHaveLength(1)
  })
})
