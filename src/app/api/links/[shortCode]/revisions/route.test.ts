import { describe, expect, it } from 'vitest'
import { revisionSchema } from './route'

describe('revisionSchema', () => {
  it('requires a destination and caps reason', () => {
    expect(revisionSchema.safeParse({}).success).toBe(false)
    expect(revisionSchema.safeParse({ destinationUrl: 'https://example.com' }).success).toBe(true)
    expect(revisionSchema.safeParse({ destinationUrl: 'https://example.com', reason: 'x'.repeat(201) }).success).toBe(false)
  })
})
