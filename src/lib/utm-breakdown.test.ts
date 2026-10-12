import { describe, expect, it } from 'vitest'
import { buildUtmBreakdown, parseUtmDays, parseUtmDimension, parseUtmLimit, UTM_NONE } from './utm-breakdown'

describe('utm breakdown', () => {
  it('parses dimension with a closed whitelist', () => {
    expect(parseUtmDimension(null)).toBe('source')
    expect(parseUtmDimension('campaign')).toBe('campaign')
    expect(parseUtmDimension('utmSource"; DROP TABLE')).toBeNull()
    expect(parseUtmDimension('Source')).toBeNull()
  })
  it('bounds days and limit', () => {
    expect(parseUtmDays(null)).toBe(30)
    expect(parseUtmDays('365')).toBe(365)
    expect(parseUtmDays('366')).toBeNull()
    expect(parseUtmDays('0')).toBeNull()
    expect(parseUtmDays('1e2')).toBeNull()
    expect(parseUtmLimit('50')).toBe(50)
    expect(parseUtmLimit('51')).toBeNull()
  })
  it('ranks, merges blanks into (none), folds the tail and computes shares', () => {
    const r = buildUtmBreakdown([
      { value: 'twitter', clicks: 6 }, { value: null, clicks: 2 }, { value: '  ', clicks: 1 },
      { value: 'email', clicks: 1 }, { value: 'a', clicks: 0 }, { value: 'zeta', clicks: 1 },
    ], 'source', 30, 2)
    expect(r.total).toBe(11)
    expect(r.rows).toEqual([{ value: 'twitter', clicks: 6, share: 54.5 }, { value: UTM_NONE, clicks: 3, share: 27.3 }])
    expect(r.otherClicks).toBe(2)
  })
  it('handles empty input', () => {
    expect(buildUtmBreakdown([], 'medium', 7, 10)).toEqual({ dimension: 'medium', days: 7, total: 0, rows: [], otherClicks: 0 })
  })
  it('breaks ties alphabetically', () => {
    const r = buildUtmBreakdown([{ value: 'b', clicks: 2 }, { value: 'a', clicks: 2 }], 'source', 30, 10)
    expect(r.rows.map((x) => x.value)).toEqual(['a', 'b'])
  })
})
