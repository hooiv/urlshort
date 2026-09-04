import { describe, expect, it } from 'vitest'
import { domainBodySchema } from './route'

describe('domainBodySchema', () => {
  it('accepts empty body and caps lengths', () => {
    expect(domainBodySchema.safeParse({}).success).toBe(true)
    expect(domainBodySchema.safeParse({ host: 'x'.repeat(300) }).success).toBe(false)
  })
})
