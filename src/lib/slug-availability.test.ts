import { describe, expect, it } from 'vitest'
import { classifySlugs, validCandidates } from './slug-availability'

describe('classifySlugs', () => {
  it('classifies each state in input order', () => {
    const r = classifySlugs(['Promo', 'promo', 'sale', 'bad code', ' fall '], new Set(['sale']))
    expect(r.map((x) => x.status)).toEqual(['available', 'duplicate', 'taken', 'invalid', 'available'])
    expect(r[4].code).toBe('fall')
    expect(r[0].quality?.score).toBeLessThan(100)
  })
  it('rejects empty, leading separators and over-long codes', () => {
    const r = classifySlugs(['', '-x', 'a'.repeat(65)], new Set())
    expect(r.every((x) => x.status === 'invalid')).toBe(true)
  })
  it('validCandidates dedupes and drops invalid', () => {
    expect(validCandidates(['a', 'a', '!', ' b'])).toEqual(['a', 'b'])
  })
})

import { describe as d2, it as i2, expect as e2 } from 'vitest'
import { classifySlugs as cs } from './slug-availability'
d2('reserved codes', () => {
  i2('flags app route names as reserved, not available', () => {
    e2(cs(['api'], new Set())[0].status).toBe('reserved')
  })
})

import { suggestAlternatives } from './slug-availability'
describe('suggestAlternatives', () => {
  it('skips taken suffixes and respects the limit', () => {
    const r = suggestAlternatives('promo', new Set(['promo2', 'promo3']), 3)
    expect(r).toEqual(['promo4', 'promo5', 'promo6'])
  })
  it('returns nothing for unusable input', () => {
    expect(suggestAlternatives('!!!', new Set())).toEqual([])
  })
  it('never suggests reserved names', () => {
    for (const s of suggestAlternatives('api', new Set())) expect(s).not.toMatch(/^api$/i)
  })
})
