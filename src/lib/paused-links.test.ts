import { describe, expect, it } from 'vitest'
import { pausedDays, parsePausedLimit, parsePausedMinAge } from './paused-links'

describe('paused-links', () => {
  it('parses strictly', () => {
    expect(parsePausedLimit(null)).toBe(50)
    expect(parsePausedLimit('200')).toBe(200)
    expect(parsePausedLimit('201')).toBeNull()
    expect(parsePausedLimit('0')).toBeNull()
    expect(parsePausedMinAge(null)).toBe(0)
    expect(parsePausedMinAge('3651')).toBeNull()
    expect(parsePausedMinAge('1e2')).toBeNull()
  })
  it('computes whole days, never negative', () => {
    const now = new Date('2026-10-23T00:00:00Z')
    expect(pausedDays(new Date('2026-10-20T12:00:00Z'), now)).toBe(2)
    expect(pausedDays(new Date('2026-10-25T00:00:00Z'), now)).toBe(0)
  })
})
