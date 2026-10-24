import { describe, expect, it } from 'vitest'
import { parseCustomOgLimit } from './custom-og-links'

describe('custom-og-links', () => {
  it('parses limit strictly', () => {
    expect(parseCustomOgLimit(null)).toBe(50)
    expect(parseCustomOgLimit('200')).toBe(200)
    expect(parseCustomOgLimit('201')).toBeNull()
    expect(parseCustomOgLimit('0')).toBeNull()
    expect(parseCustomOgLimit('1e2')).toBeNull()
  })
})
