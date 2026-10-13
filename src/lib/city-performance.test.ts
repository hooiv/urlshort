import { describe, expect, it } from 'vitest'
import { parseCityWindow, shapeCityStats } from './city-performance'

describe('parseCityWindow', () => {
  it('defaults and validates', () => {
    expect(parseCityWindow(null)).toBe(30)
    expect(parseCityWindow('7')).toBe(7)
    expect(parseCityWindow('14')).toBeNull()
  })
})

describe('shapeCityStats', () => {
  it('merges case/space variants, separates countries, drops blanks', () => {
    const out = shapeCityStats([
      { city: 'Paris', country: 'FR', clicks: 30n, visitors: 10n, previous: 15n },
      { city: ' paris ', country: 'fr', clicks: 10, visitors: 2, previous: 0 },
      { city: 'Paris', country: 'US', clicks: 20, visitors: 5, previous: 0 },
      { city: '  ', country: 'US', clicks: 99, visitors: 9, previous: 0 },
      { city: null, country: 'US', clicks: 99, visitors: 9, previous: 0 },
    ])
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ city: 'Paris', country: 'FR', countryName: 'France', clicks: 40, visitors: 12, changePct: 166.7, sharePct: 66.7 })
    expect(out[1]).toMatchObject({ country: 'US', clicks: 20, changePct: null })
  })
  it('keeps cities that only had previous traffic', () => {
    expect(shapeCityStats([{ city: 'Oslo', country: 'NO', clicks: 0, visitors: 0, previous: 4 }])[0]).toMatchObject({ changePct: -100, sharePct: 0 })
  })
})
