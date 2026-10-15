import { describe, expect, it } from 'vitest'
import { giniCoefficient, parseConcentrationDays, shapeConcentration } from './click-concentration'

const row = (n: string, clicks: number | bigint) => ({ id: n, shortCode: n, title: null, clicks })

describe('click concentration', () => {
  it('parses days strictly', () => {
    expect(parseConcentrationDays(null)).toBe(30)
    expect(parseConcentrationDays('90')).toBe(90)
    expect(parseConcentrationDays('14')).toBeNull()
    expect(parseConcentrationDays('7d')).toBeNull()
  })
  it('gini is 0 for even, high for skewed', () => {
    expect(giniCoefficient([5, 5, 5, 5])).toBeCloseTo(0, 5)
    expect(giniCoefficient([0, 0, 0, 100])).toBeCloseTo(0.75, 5)
    expect(giniCoefficient([])).toBe(0)
  })
  it('handles no traffic', () => {
    const c = shapeConcentration([row('a', 0)], 30)
    expect(c.level).toBe('none')
    expect(c.top).toEqual([])
  })
  it('flags one dominant link', () => {
    const c = shapeConcentration([row('a', 90), row('b', 5), row('c', 5)], 30)
    expect(c.level).toBe('concentrated')
    expect(c.topShares[0]).toEqual({ top: 1, share: 0.9 })
    expect(c.linksFor80Percent).toBe(1)
    expect(c.top[0].shortCode).toBe('a')
  })
  it('calls an even portfolio diversified and counts links for 80%', () => {
    const rows = Array.from({ length: 10 }, (_, i) => row(`l${i}`, BigInt(10)))
    const c = shapeConcentration(rows, 7)
    expect(c.level).toBe('diversified')
    expect(c.linksFor80Percent).toBe(8)
    expect(c.topShares[2].share).toBe(1)
  })
})
