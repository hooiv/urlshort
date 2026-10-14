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
