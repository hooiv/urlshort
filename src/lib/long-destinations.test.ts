import { describe, expect, it } from 'vitest'
import { longUrlRisk, parseLongUrlLimit, parseLongUrlThreshold } from './long-destinations'

describe('long destinations', () => {
  it('parses limit', () => {
    expect(parseLongUrlLimit(null)).toBe(50)
    expect(parseLongUrlLimit('200')).toBe(200)
    expect(parseLongUrlLimit('201')).toBeNull()
    expect(parseLongUrlLimit('0')).toBeNull()
    expect(parseLongUrlLimit('1e2')).toBeNull()
  })
  it('parses threshold', () => {
    expect(parseLongUrlThreshold('')).toBe(1500)
    expect(parseLongUrlThreshold('200')).toBe(200)
    expect(parseLongUrlThreshold('199')).toBeNull()
    expect(parseLongUrlThreshold('8001')).toBeNull()
    expect(parseLongUrlThreshold('-5')).toBeNull()
  })
  it('classifies risk', () => {
    expect(longUrlRisk(1999)).toBe('elevated')
    expect(longUrlRisk(2000)).toBe('high')
  })
})
