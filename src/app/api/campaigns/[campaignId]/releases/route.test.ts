import { describe, expect, it } from 'vitest'
import { isValidScheduledAt, schema } from './route'

describe('release schema', () => {
  it('accepts empty body with defaults', () => {
    const parsed = schema.safeParse({})
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.requireApproval).toBe(true)
  })

  it('rejects non-datetime scheduledAt', () => {
    expect(schema.safeParse({ scheduledAt: 'not-a-date' }).success).toBe(false)
  })
})

describe('isValidScheduledAt', () => {
  it('allows null and future dates', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    expect(isValidScheduledAt(null, now)).toBe(true)
    expect(isValidScheduledAt(undefined, now)).toBe(true)
    expect(isValidScheduledAt('2026-01-02T00:00:00.000Z', now)).toBe(true)
  })

  it('rejects past and invalid dates', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    expect(isValidScheduledAt('2025-12-01T00:00:00.000Z', now)).toBe(false)
    expect(isValidScheduledAt('bogus', now)).toBe(false)
  })
})
