import { describe, expect, it } from 'vitest'
import { capUsage, parseNearCapLimit, parseNearCapThreshold } from './near-cap-links'

describe('near-cap-links', () => {
  it('parses limit and threshold strictly', () => {
    expect(parseNearCapLimit(null)).toBe(50)
    expect(parseNearCapLimit('201')).toBeNull()
    expect(parseNearCapLimit('x')).toBeNull()
    expect(parseNearCapThreshold(null)).toBe(80)
    expect(parseNearCapThreshold('99')).toBe(99)
    expect(parseNearCapThreshold('100')).toBeNull()
    expect(parseNearCapThreshold('0')).toBeNull()
    expect(parseNearCapThreshold('5.5')).toBeNull()
  })
  it('computes usage with floor and non-negative remaining', () => {
    expect(capUsage(89, 100)).toEqual({ percentUsed: 89, remaining: 11 })
    expect(capUsage(2, 3)).toEqual({ percentUsed: 66, remaining: 1 })
    expect(capUsage(7, 5)).toEqual({ percentUsed: 140, remaining: 0 })
  })
})
