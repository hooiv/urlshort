import { describe, expect, it } from 'vitest'
import { missingUtmParams, parseCoverageLimit, shapeCoverage } from './utm-coverage'

describe('utm coverage', () => {
  it('detects missing and empty params', () => {
    expect(missingUtmParams('https://a.test/?utm_source=x&utm_medium=y&utm_campaign=z')).toEqual([])
    expect(missingUtmParams('https://a.test/?utm_source=x&utm_medium=%20')).toEqual(['utm_medium', 'utm_campaign'])
    expect(missingUtmParams('https://a.test/')).toHaveLength(3)
    expect(missingUtmParams('not a url')).toHaveLength(3)
  })
  it('shapes only links with gaps', () => {
    const r = shapeCoverage([
      { id: '1', shortCode: 'a', title: null, originalUrl: 'https://a.test/?utm_source=a&utm_medium=b&utm_campaign=c' },
      { id: '2', shortCode: 'b', title: null, originalUrl: 'https://b.test/?utm_source=a' },
    ])
    expect(r).toHaveLength(1)
    expect(r[0].missing).toEqual(['utm_medium', 'utm_campaign'])
  })
  it('parses limit strictly', () => {
    expect(parseCoverageLimit(null)).toBe(50)
    expect(parseCoverageLimit('200')).toBe(200)
    expect(parseCoverageLimit('201')).toBeNull()
    expect(parseCoverageLimit('x')).toBeNull()
  })
})
