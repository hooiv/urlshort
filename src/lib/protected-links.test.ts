import { describe, expect, it } from 'vitest'
import { parseProtectedLimit } from './protected-links'

describe('protected-links', () => {
  it('parses limit strictly', () => {
    expect(parseProtectedLimit(null)).toBe(50)
    expect(parseProtectedLimit('')).toBe(50)
    expect(parseProtectedLimit('200')).toBe(200)
    expect(parseProtectedLimit('201')).toBeNull()
    expect(parseProtectedLimit('0')).toBeNull()
    expect(parseProtectedLimit('1e2')).toBeNull()
  })
})
