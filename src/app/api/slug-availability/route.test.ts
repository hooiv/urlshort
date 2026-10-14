import { describe, expect, it } from 'vitest'
import { availabilitySchema } from './route'

describe('availabilitySchema', () => {
  it('bounds list size', () => {
    expect(availabilitySchema.safeParse({ codes: [] }).success).toBe(false)
    expect(availabilitySchema.safeParse({ codes: Array(51).fill('a') }).success).toBe(false)
    expect(availabilitySchema.safeParse({ codes: ['a'] }).success).toBe(true)
  })
})
