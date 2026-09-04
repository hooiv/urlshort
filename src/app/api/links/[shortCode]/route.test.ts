import { describe, expect, it } from 'vitest'
import { parseMaxClicks } from './route'

describe('parseMaxClicks', () => {
  it('accepts nullish and valid integers', () => {
    expect(parseMaxClicks(null)).toBeNull()
    expect(parseMaxClicks('')).toBeNull()
    expect(parseMaxClicks('5')).toBe(5)
    expect(parseMaxClicks(0)).toBe(0)
  })

  it('rejects NaN and out-of-range values', () => {
    expect(() => parseMaxClicks('abc')).toThrow()
    expect(() => parseMaxClicks('-3')).toThrow()
    expect(() => parseMaxClicks('1.2')).toThrow()
  })
})
