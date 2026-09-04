import { describe, expect, it } from 'vitest'
import { bioBlockSchema, isSafeBlockUrl } from './route'

describe('bioBlockSchema', () => {
  it('accepts a valid link block', () => {
    expect(bioBlockSchema.safeParse({ type: 'link', title: 'Home', url: 'https://example.com' }).success).toBe(
      true,
    )
  })

  it('rejects unknown types and oversized fields', () => {
    expect(bioBlockSchema.safeParse({ type: 'evil' }).success).toBe(false)
    expect(bioBlockSchema.safeParse({ type: 'link', title: 'x'.repeat(161) }).success).toBe(false)
  })
})

describe('isSafeBlockUrl', () => {
  it('allows http and https', () => {
    expect(isSafeBlockUrl('https://example.com/a')).toBe(true)
    expect(isSafeBlockUrl('http://example.com/a')).toBe(true)
  })

  it('rejects javascript and invalid urls', () => {
    expect(isSafeBlockUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeBlockUrl('not-a-url')).toBe(false)
  })
})
