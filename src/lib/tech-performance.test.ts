import { describe, expect, it } from 'vitest'
import { parseTechDimension, parseTechWindow, shapeTechStats } from './tech-performance'

describe('parsers', () => {
  it('validate dimension and window', () => {
    expect(parseTechDimension(null)).toBe('device')
    expect(parseTechDimension('os')).toBe('os')
    expect(parseTechDimension('"deviceType"; drop')).toBeNull()
    expect(parseTechWindow('7')).toBe(7)
    expect(parseTechWindow('8')).toBeNull()
  })
})

describe('shapeTechStats', () => {
  it('merges case variants and blanks, computes change and share', () => {
    const out = shapeTechStats([
      { value: 'Chrome', clicks: 60n, visitors: 30n, previous: 40n },
      { value: 'chrome ', clicks: 20, visitors: 5, previous: 0 },
      { value: null, clicks: 10, visitors: 2, previous: 0 },
      { value: '  ', clicks: 10, visitors: 1, previous: 0 },
      { value: 'Edge', clicks: 0, visitors: 0, previous: 0 },
    ])
    expect(out.map((r) => r.label)).toEqual(['Chrome', 'Unknown'])
    expect(out[0]).toMatchObject({ clicks: 80, visitors: 35, changePct: 100, sharePct: 80 })
    expect(out[1]).toMatchObject({ value: null, clicks: 20, changePct: null })
  })
  it('keeps values that only had previous traffic', () => {
    expect(shapeTechStats([{ value: 'mobile', clicks: 0, visitors: 0, previous: 5 }])[0]).toMatchObject({ label: 'Mobile', changePct: -100 })
  })
})
