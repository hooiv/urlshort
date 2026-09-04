import { describe, expect, it } from 'vitest'
import { unfurlSchema } from './route'

describe('unfurlSchema', () => {
  it('accepts a normal URL', () => {
    expect(unfurlSchema.parse({ url: 'https://example.com/a' }).url).toBe('https://example.com/a')
  })

  it('rejects empty and oversized URLs', () => {
    expect(unfurlSchema.safeParse({ url: '' }).success).toBe(false)
    expect(unfurlSchema.safeParse({ url: 'https://example.com/' + 'x'.repeat(2048) }).success).toBe(false)
    expect(unfurlSchema.safeParse({}).success).toBe(false)
  })
})
