import { describe, expect, it } from 'vitest'
import { isWithinActiveHours, nextActiveAt, parseActiveHours } from './active-hours'

const weekdays = parseActiveHours({ timezone: 'America/New_York', windows: [{ days: [5, 1, 2, 3, 4, 1], start: '09:00', end: '17:30' }] })!

describe('parseActiveHours', () => {
  it('normalises days and passes null/empty through', () => {
    expect(weekdays.windows[0].days).toEqual([1, 2, 3, 4, 5])
    expect(parseActiveHours(null)).toBeNull()
    expect(parseActiveHours({ timezone: 'UTC', windows: [] })).toBeNull()
  })
  it('rejects bad input', () => {
    expect(() => parseActiveHours({ timezone: 'Mars/Base', windows: [{ days: [1], start: '09:00', end: '10:00' }] })).toThrow(/timezone/)
    expect(() => parseActiveHours({ timezone: 'UTC', windows: [{ days: [7], start: '09:00', end: '10:00' }] })).toThrow(/days/)
    expect(() => parseActiveHours({ timezone: 'UTC', windows: [{ days: [1], start: '9:00', end: '10:00' }] })).toThrow(/HH:MM/)
    expect(() => parseActiveHours({ timezone: 'UTC', windows: [{ days: [1], start: '10:00', end: '10:00' }] })).toThrow(/differ/)
    expect(() => parseActiveHours('x')).toThrow()
  })
})

describe('isWithinActiveHours', () => {
  it('is always active without a schedule', () => expect(isWithinActiveHours(null)).toBe(true))
  it('respects window bounds in the timezone (EDT = UTC-4)', () => {
    expect(isWithinActiveHours(weekdays, new Date('2026-10-14T13:00:00Z'))).toBe(true) // Wed 09:00
    expect(isWithinActiveHours(weekdays, new Date('2026-10-14T12:59:00Z'))).toBe(false)
    expect(isWithinActiveHours(weekdays, new Date('2026-10-14T21:30:00Z'))).toBe(false) // 17:30 exclusive
    expect(isWithinActiveHours(weekdays, new Date('2026-10-17T15:00:00Z'))).toBe(false) // Saturday
  })
  it('handles DST change (EST = UTC-5 after Nov 1)', () => {
    expect(isWithinActiveHours(weekdays, new Date('2026-11-02T14:00:00Z'))).toBe(true) // Mon 09:00 EST
    expect(isWithinActiveHours(weekdays, new Date('2026-11-02T13:30:00Z'))).toBe(false)
  })
  it('wraps overnight windows to the following day', () => {
    const night = parseActiveHours({ timezone: 'UTC', windows: [{ days: [5], start: '22:00', end: '02:00' }] })!
    expect(isWithinActiveHours(night, new Date('2026-10-16T23:00:00Z'))).toBe(true) // Fri 23:00
    expect(isWithinActiveHours(night, new Date('2026-10-17T01:59:00Z'))).toBe(true) // Sat 01:59
    expect(isWithinActiveHours(night, new Date('2026-10-17T02:00:00Z'))).toBe(false)
    expect(isWithinActiveHours(night, new Date('2026-10-17T23:00:00Z'))).toBe(false) // Sat night not listed
  })
})

describe('nextActiveAt', () => {
  it('finds the next opening', () => {
    expect(nextActiveAt(weekdays, new Date('2026-10-17T15:00:00Z'))?.toISOString()).toBe('2026-10-19T13:00:00.000Z')
    const now = new Date('2026-10-14T15:00:00Z')
    expect(nextActiveAt(weekdays, now)?.toISOString()).toBe(now.toISOString())
  })
})
