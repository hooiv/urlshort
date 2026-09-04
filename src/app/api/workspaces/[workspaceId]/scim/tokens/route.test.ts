import { describe, expect, it } from 'vitest'
import { scimTokenSchema } from './route'

describe('scimTokenSchema', () => {
  it('accepts a trimmed name', () => {
    expect(scimTokenSchema.safeParse({ name: 'Entra sync' }).success).toBe(true)
  })

  it('rejects empty, blank, and oversized names', () => {
    expect(scimTokenSchema.safeParse({ name: '' }).success).toBe(false)
    expect(scimTokenSchema.safeParse({ name: '   ' }).success).toBe(false)
    expect(scimTokenSchema.safeParse({ name: 'x'.repeat(101) }).success).toBe(false)
    expect(scimTokenSchema.safeParse({}).success).toBe(false)
  })
})
