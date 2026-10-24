import { describe, expect, it } from 'vitest'
import { parseRoutedLimit } from './routed-links'

describe('routed-links', () => {
  it('parses limit strictly', () => {
    expect(parseRoutedLimit(null)).toBe(50)
    expect(parseRoutedLimit('200')).toBe(200)
    expect(parseRoutedLimit('201')).toBeNull()
    expect(parseRoutedLimit('0')).toBeNull()
    expect(parseRoutedLimit('1e2')).toBeNull()
  })
})
