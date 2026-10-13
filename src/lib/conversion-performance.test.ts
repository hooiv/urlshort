import { describe, expect, it } from 'vitest'
import { parseConversionWindow, shapeConversionStats } from './conversion-performance'

describe('parseConversionWindow', () => {
  it('defaults and validates', () => {
    expect(parseConversionWindow(null)).toBe(30)
    expect(parseConversionWindow('7')).toBe(7)
    expect(parseConversionWindow('14')).toBeNull()
    expect(parseConversionWindow('abc')).toBeNull()
  })
})

describe('shapeConversionStats', () => {
  it('computes rate, change and per-currency revenue, sorted by conversions', () => {
    const out = shapeConversionStats([
      { shortCode: 'b', clicks: 10n, conversions: 2n, previous: 1n, revenue: { usd: 500, EUR: 900, xx: 5, GBP: 0 } },
      { shortCode: 'a', clicks: 0n, conversions: 5n, previous: 0n, revenue: null },
      { shortCode: 'z', clicks: 4, conversions: 0, previous: 0, revenue: null },
      { shortCode: 'c', clicks: 1, conversions: 3, previous: 0, revenue: '{"USD":100}' },
    ])
    expect(out.map((r) => r.shortCode)).toEqual(['a', 'c', 'b'])
    expect(out[0]).toMatchObject({ conversionRatePct: null, changePct: null, revenue: [] })
    expect(out[1]).toMatchObject({ conversionRatePct: 100, revenue: [{ currency: 'USD', cents: 100 }] })
    expect(out[2]).toMatchObject({ conversionRatePct: 20, changePct: 100 })
    expect(out[2].revenue).toEqual([{ currency: 'EUR', cents: 900 }, { currency: 'USD', cents: 500 }])
  })
  it('keeps links whose only conversions were in the previous window', () => {
    const out = shapeConversionStats([{ shortCode: 'p', clicks: 3, conversions: 0, previous: 2, revenue: null }])
    expect(out[0]).toMatchObject({ conversions: 0, changePct: -100 })
  })
})
