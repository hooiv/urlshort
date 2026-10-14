import { describe, expect, it } from 'vitest'
import { toAvailability } from './useSlugAvailability'

describe('toAvailability', () => {
  it('maps known statuses and caps alternatives at 5', () => {
    expect(toAvailability({ status: 'taken', alternatives: ['a', 'b', 'c', 'd', 'e', 'f'] }).alternatives).toHaveLength(5)
    expect(toAvailability({ status: 'available' })).toEqual({ status: 'available', alternatives: [] })
  })
  it('falls back to error for missing or unknown rows', () => {
    expect(toAvailability(undefined).status).toBe('error')
    expect(toAvailability({ status: 'weird' }).status).toBe('error')
  })
})
