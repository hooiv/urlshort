import { describe, it, expect } from 'vitest'
import { formatTimeLeft, urgency } from './expiring-format'

describe('expiring-format', () => {
  it('formats durations', () => {
    expect(formatTimeLeft(null)).toBe('')
    expect(formatTimeLeft(-5)).toBe('expired')
    expect(formatTimeLeft(10_000)).toBe('1m left')
    expect(formatTimeLeft(5 * 3_600_000)).toBe('5h left')
    expect(formatTimeLeft(5 * 86_400_000)).toBe('5d left')
  })
  it('grades urgency', () => {
    expect(urgency(3_600_000, null)).toBe('critical')
    expect(urgency(null, 5)).toBe('critical')
    expect(urgency(2 * 86_400_000, null)).toBe('warning')
    expect(urgency(null, 50)).toBe('warning')
    expect(urgency(10 * 86_400_000, null)).toBe('ok')
  })
})
