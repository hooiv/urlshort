import { describe, expect, it } from 'vitest'
import { hostOf, rankTagSuggestions, tagSuggestSchema } from './tag-suggest'

describe('hostOf', () => {
  it('strips www and scheme optionality', () => {
    expect(hostOf('https://www.Example.com/a')).toBe('example.com')
    expect(hostOf('example.com/x')).toBe('example.com')
  })
  it('returns null for garbage', () => expect(hostOf('http://')).toBeNull())
})

describe('rankTagSuggestions', () => {
  const samples = [
    { originalUrl: 'https://shop.com/sale/a', tags: ['promo', 'q4'] },
    { originalUrl: 'https://www.shop.com/sale/b', tags: ['promo'] },
    { originalUrl: 'https://shop.com/blog/x', tags: ['content', 'promo'] },
    { originalUrl: 'https://other.com/sale', tags: ['nope'] },
  ]
  it('weights same-path matches above host-only', () => {
    const r = rankTagSuggestions('https://shop.com/sale/new', samples)
    expect(r.map((s) => s.tag)).toEqual(['promo', 'q4', 'content'])
    expect(r[0]).toMatchObject({ score: 7, reason: 'same-path' })
    expect(r[2].reason).toBe('same-host')
  })
  it('ignores other hosts and respects limit', () => {
    expect(rankTagSuggestions('https://shop.com/', samples, 1)).toHaveLength(1)
    expect(rankTagSuggestions('https://zzz.com/', samples)).toEqual([])
  })
  it('counts a tag once per link', () => {
    expect(rankTagSuggestions('shop.com', [{ originalUrl: 'https://shop.com', tags: ['a', 'a'] }])[0].score).toBe(1)
  })
})

describe('tagSuggestSchema', () => {
  it('coerces limit and requires url', () => {
    expect(tagSuggestSchema.parse({ url: 'a.com', limit: '3' }).limit).toBe(3)
    expect(tagSuggestSchema.safeParse({}).success).toBe(false)
  })
})
