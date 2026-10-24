import { describe, expect, it } from 'vitest'
import { parseCloakedLimit } from './cloaked-links'

describe('cloaked-links', () => {
  it('parses limit strictly', () => {
    expect(parseCloakedLimit(null)).toBe(50)
    expect(parseCloakedLimit('200')).toBe(200)
    expect(parseCloakedLimit('201')).toBeNull()
    expect(parseCloakedLimit('0')).toBeNull()
    expect(parseCloakedLimit('1e2')).toBeNull()
  })
})
