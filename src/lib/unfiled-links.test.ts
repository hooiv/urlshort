import { describe, expect, it } from 'vitest'
import { parseUnfiledLimit } from './unfiled-links'

describe('unfiled-links', () => {
  it('parses limit strictly', () => {
    expect(parseUnfiledLimit(null)).toBe(50)
    expect(parseUnfiledLimit('')).toBe(50)
    expect(parseUnfiledLimit('200')).toBe(200)
    expect(parseUnfiledLimit('201')).toBeNull()
    expect(parseUnfiledLimit('0')).toBeNull()
    expect(parseUnfiledLimit('1.5')).toBeNull()
  })
})
