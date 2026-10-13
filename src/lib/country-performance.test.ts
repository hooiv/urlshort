import { describe, expect, it } from 'vitest'
import { countryName, parseCountryWindow, shapeCountryStats } from './country-performance'

describe('parseCountryWindow', () => {
  it('defaults and validates', () => {
    expect(parseCountryWindow(null)).toBe(30)
    expect(parseCountryWindow('90')).toBe(90)
    expect(parseCountryWindow('14')).toBeNull()
    expect(parseCountryWindow('1e1')).toBeNull()
  })
})

describe('countryName', () => {
  it('resolves names and falls back to Unknown', () => {
    expect(countryName('in')).toBe('India')
    expect(countryName(null)).toBe('Unknown')
    expect(countryName('XYZ')).toBe('Unknown')
  })
})

describe('shapeCountryStats', () => {
  it('merges case variants and junk into Unknown, computes change and share', () => {
    const out = shapeCountryStats([
      { country: 'US', clicks: 60n, visitors: 30n, previous: 40n },
      { country: 'us', clicks: 20, visitors: 5, previous: 0 },
      { country: null, clicks: 10, visitors: 2, previous: 0 },
      { country: 'zzz', clicks: 10, visitors: 1, previous: 0 },
      { country: 'DE', clicks: 0, visitors: 0, previous: 0 },
    ])
    expect(out.map((c) => c.name)).toEqual(['United States', 'Unknown'])
    expect(out[0]).toMatchObject({ clicks: 80, visitors: 35, changePct: 100, sharePct: 80 })
    expect(out[1]).toMatchObject({ country: null, clicks: 20, changePct: null })
  })
  it('keeps countries that only had previous traffic', () => {
    const out = shapeCountryStats([{ country: 'FR', clicks: 0, visitors: 0, previous: 5 }])
    expect(out[0]).toMatchObject({ clicks: 0, changePct: -100, sharePct: 0 })
  })
})
