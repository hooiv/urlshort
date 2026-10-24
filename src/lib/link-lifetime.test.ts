import { describe, it, expect } from 'vitest'
import { parseLifetimeMinutes, isLifetimeElapsed, MAX_LIFETIME_MINUTES } from './link-lifetime'

describe('parseLifetimeMinutes', () => {
  it('clears on empty', () => {
    expect(parseLifetimeMinutes(null)).toBeNull()
    expect(parseLifetimeMinutes('')).toBeNull()
    expect(parseLifetimeMinutes(undefined)).toBeNull()
  })
  it('accepts integers in range, including numeric strings', () => {
    expect(parseLifetimeMinutes(30)).toBe(30)
    expect(parseLifetimeMinutes(' 90 ')).toBe(90)
    expect(parseLifetimeMinutes(MAX_LIFETIME_MINUTES)).toBe(MAX_LIFETIME_MINUTES)
  })
  it.each([0, -1, 1.5, 'abc', MAX_LIFETIME_MINUTES + 1, NaN])('rejects %s', (v) => {
    expect(() => parseLifetimeMinutes(v)).toThrow(/lifetimeMinutes/)
  })
})

describe('isLifetimeElapsed', () => {
  const start = new Date('2026-01-01T00:00:00Z')
  it('is open at exactly the boundary and closed after', () => {
    expect(isLifetimeElapsed(start, 10, new Date('2026-01-01T00:10:00Z'))).toBe(false)
    expect(isLifetimeElapsed(start, 10, new Date('2026-01-01T00:10:00.001Z'))).toBe(true)
  })
})
