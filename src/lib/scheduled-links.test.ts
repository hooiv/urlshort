import { describe, expect, it } from 'vitest'
import { parseScheduledLimit } from './scheduled-links'

describe('scheduled-links', () => {
  it('parses limit strictly', () => {
    expect(parseScheduledLimit(null)).toBe(50)
    expect(parseScheduledLimit('')).toBe(50)
    expect(parseScheduledLimit('200')).toBe(200)
    expect(parseScheduledLimit('201')).toBeNull()
    expect(parseScheduledLimit('0')).toBeNull()
    expect(parseScheduledLimit('1.5')).toBeNull()
  })
})
