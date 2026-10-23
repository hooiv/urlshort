import { describe, expect, it } from 'vitest'
import { computeExtendedExpiry, computeExtendedMaxClicks, validateExtend } from './link-extend'

const now = new Date('2026-10-23T00:00:00Z')

describe('validateExtend', () => {
  it('requires at least one field', () => expect(validateExtend({}).ok).toBe(false))
  it('accepts days and addClicks', () => expect(validateExtend({ days: 7, addClicks: 50 })).toEqual({ ok: true, days: 7, addClicks: 50 }))
  it('rejects bad values', () => {
    for (const days of [0, -1, 1.5, '7', 4000, null]) expect(validateExtend({ days }).ok).toBe(false)
    for (const addClicks of [0, 2.5, '5', 2e9]) expect(validateExtend({ addClicks }).ok).toBe(false)
  })
})

describe('computeExtendedExpiry', () => {
  it('extends from the current future expiry', () => {
    expect(computeExtendedExpiry(new Date('2026-11-01T00:00:00Z'), 2, now).toISOString()).toBe('2026-11-03T00:00:00.000Z')
  })
  it('restarts from now when expired or unset', () => {
    expect(computeExtendedExpiry(new Date('2026-01-01T00:00:00Z'), 1, now).toISOString()).toBe('2026-10-24T00:00:00.000Z')
    expect(computeExtendedExpiry(null, 1, now).toISOString()).toBe('2026-10-24T00:00:00.000Z')
  })
})

describe('computeExtendedMaxClicks', () => {
  it('adds to a cap, keeps unlimited unlimited, clamps', () => {
    expect(computeExtendedMaxClicks(100, 50)).toBe(150)
    expect(computeExtendedMaxClicks(null, 50)).toBeNull()
    expect(computeExtendedMaxClicks(999_999_999, 50)).toBe(1_000_000_000)
  })
})
