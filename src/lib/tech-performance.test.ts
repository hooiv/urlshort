import { describe, expect, it } from 'vitest'
import { parseTechDimension, parseTechWindow, shapeTechStats } from './tech-performance'

describe('parsers', () => {
  it('validates dimension and window', () => {
    expect(parseTechDimension(null)).toBe('browser')
    expect(parseTechDimension('os')).toBe('os')
    expect(parseTechDimension('deviceType; drop')).toBeNull()
    expect(parseTechWindow('30')).toBe(30)
    expect(parseTechWindow('5')).toBeNull()
  })
})

describe('shapeTechStats', () => {
  it('computes share, change and caps visitors', () => {
    const out = shapeTechStats([
      { value: 'Chrome', clicks: 75n, visitors: 90n, previous: 50n },
      { value: null, clicks: 25, visitors: 3, previous: 0 },
      { value: 'Opera', clicks: 0, visitors: 0, previous: 0 },
      { value: 'Edge', clicks: 0, visitors: 0, previous: 4 },
    ])
    expect(out.map((r) => r.name)).toEqual(['Chrome', 'Unknown', 'Edge'])
    expect(out[0]).toMatchObject({ visitors: 75, changePct: 50, sharePct: 75 })
    expect(out[2].changePct).toBe(-100)
  })
})
