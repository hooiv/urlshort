import { describe, expect, it } from 'vitest'
import { ageInDays, parseNeverClickedLimit, parseNeverClickedMinAge } from './never-clicked-links'

describe('never-clicked-links', () => {
  it('parses limit and min age strictly', () => {
    expect(parseNeverClickedLimit(null)).toBe(50)
    expect(parseNeverClickedLimit('200')).toBe(200)
    expect(parseNeverClickedLimit('201')).toBeNull()
    expect(parseNeverClickedLimit('0')).toBeNull()
    expect(parseNeverClickedMinAge(null)).toBe(7)
    expect(parseNeverClickedMinAge('0')).toBe(0)
    expect(parseNeverClickedMinAge('3651')).toBeNull()
    expect(parseNeverClickedMinAge('-1')).toBeNull()
    expect(parseNeverClickedMinAge('1e2')).toBeNull()
  })
  it('computes whole-day age', () => {
    const now = new Date('2026-10-23T00:00:00Z')
    expect(ageInDays(new Date('2026-10-20T12:00:00Z'), now)).toBe(2)
    expect(ageInDays(new Date('2026-10-24T00:00:00Z'), now)).toBe(0)
  })
})
