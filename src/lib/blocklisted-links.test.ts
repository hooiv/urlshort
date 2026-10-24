import { describe, expect, it } from 'vitest'
import { parseBlocklistedLimit } from './blocklisted-links'

describe('blocklisted-links', () => {
  it('parses limit strictly', () => {
    expect(parseBlocklistedLimit(null)).toBe(50)
    expect(parseBlocklistedLimit('200')).toBe(200)
    expect(parseBlocklistedLimit('201')).toBeNull()
    expect(parseBlocklistedLimit('0')).toBeNull()
    expect(parseBlocklistedLimit('1e2')).toBeNull()
  })
})
