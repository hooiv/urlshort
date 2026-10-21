import { describe, expect, it } from 'vitest'
import { isWithinRuleSchedule, normalizeRuleSchedule, parseRuleSchedule } from './rule-schedule'

describe('rule schedule', () => {
  it('normalizes and sorts', () => {
    expect(normalizeRuleSchedule(' Asia/Kolkata|MON-Fri 9:00-17:00 ')).toBe('Asia/Kolkata|mon,tue,wed,thu,fri 09:00-17:00')
    expect(normalizeRuleSchedule('')).toBeNull()
    expect(normalizeRuleSchedule(undefined)).toBeNull()
  })
  it('rejects bad input', () => {
    for (const bad of ['mon 09:00-17:00', 'Nope/Zone|mon 09:00-17:00', 'UTC|funday 09:00-17:00', 'UTC|mon 25:00-26:00', 'UTC|mon 09:00-09:00', 'UTC|mon 9-17', 'UTC|']) {
      expect(() => normalizeRuleSchedule(bad), bad).toThrow()
    }
  })
  it('matches in the rule timezone', () => {
    const s = 'Asia/Kolkata|mon-fri 09:00-17:00'
    // Wed 2026-10-21 10:00 IST = 04:30Z
    expect(isWithinRuleSchedule(s, new Date('2026-10-21T04:30:00Z'))).toBe(true)
    expect(isWithinRuleSchedule(s, new Date('2026-10-21T11:30:00Z'))).toBe(false) // 17:00 IST, end exclusive
    expect(isWithinRuleSchedule(s, new Date('2026-10-24T04:30:00Z'))).toBe(false) // Saturday
  })
  it('handles windows crossing midnight on the start day', () => {
    const s = 'UTC|fri 22:00-02:00'
    expect(isWithinRuleSchedule(s, new Date('2026-10-23T23:00:00Z'))).toBe(true) // Fri 23:00
    expect(isWithinRuleSchedule(s, new Date('2026-10-24T01:00:00Z'))).toBe(true) // Sat 01:00
    expect(isWithinRuleSchedule(s, new Date('2026-10-24T03:00:00Z'))).toBe(false)
    expect(isWithinRuleSchedule(s, new Date('2026-10-23T01:00:00Z'))).toBe(false) // Fri 01:00 belongs to Thu's window
  })
  it('follows DST', () => {
    const s = 'America/New_York|sun 09:00-10:00'
    expect(isWithinRuleSchedule(s, new Date('2026-10-25T13:30:00Z'))).toBe(true) // EDT
    expect(isWithinRuleSchedule(s, new Date('2026-11-01T14:30:00Z'))).toBe(true) // EST
    expect(isWithinRuleSchedule(s, new Date('2026-11-01T13:30:00Z'))).toBe(false)
  })
  it('supports multiple windows and fails open on garbage/null', () => {
    const s = 'UTC|mon 08:00-09:00;tue 08:00-09:00'
    expect(parseRuleSchedule(s).windows).toHaveLength(2)
    expect(isWithinRuleSchedule(s, new Date('2026-10-20T08:30:00Z'))).toBe(true)
    expect(isWithinRuleSchedule('garbage', new Date())).toBe(true)
    expect(isWithinRuleSchedule(null, new Date())).toBe(true)
  })
})

describe('normalize', () => {
  it('canonicalises and rejects bad input', () => {
    expect(normalizeRuleSchedule('Asia/Kolkata|MON-FRI 9:00-17:00')).toBe('Asia/Kolkata|mon,tue,wed,thu,fri 09:00-17:00')
    expect(normalizeRuleSchedule('')).toBeNull()
    expect(() => normalizeRuleSchedule('Nope/Zone|mon 09:00-10:00')).toThrow()
  })
})
