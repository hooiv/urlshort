import { describe, expect, it } from 'vitest'
import { slugSuggestSchema } from './route'

describe('slugSuggestSchema', () => {
  it('defaults missing fields to empty strings', () => {
    expect(slugSuggestSchema.parse({})).toEqual({ title: '', url: '' })
  })

  it('rejects oversized title or url (DoS guard)', () => {
    expect(slugSuggestSchema.safeParse({ title: 'x'.repeat(201) }).success).toBe(false)
    expect(slugSuggestSchema.safeParse({ url: 'x'.repeat(2049) }).success).toBe(false)
  })
})
