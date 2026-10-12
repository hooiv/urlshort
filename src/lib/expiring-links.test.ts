import { describe, expect, it } from 'vitest'
import { classifyExpiring, parseHorizonDays } from './expiring-links'

const now = new Date('2026-10-12T06:30:00Z')
const base = { id: 'i', shortCode: 's', originalUrl: 'https://e.com', expiresAt: null, clicks: 0, maxClicks: null }
const days = (n: number) => new Date(now.getTime() + n * 86_400_000)

describe('expiring links', () => {
  it('flags time expiry inside the horizon only', () => {
    expect(classifyExpiring({ ...base, expiresAt: days(3) }, now, 7)?.reason).toBe('time')
    expect(classifyExpiring({ ...base, expiresAt: days(8) }, now, 7)).toBeNull()
    expect(classifyExpiring({ ...base, expiresAt: days(-1) }, now, 7)).toBeNull()
  })
  it('flags click caps at 80% but not exhausted or low ones', () => {
    const hit = classifyExpiring({ ...base, clicks: 80, maxClicks: 100 }, now, 7)
    expect(hit).toMatchObject({ reason: 'clicks', remainingClicks: 20, msUntilExpiry: null })
    expect(classifyExpiring({ ...base, clicks: 79, maxClicks: 100 }, now, 7)).toBeNull()
    expect(classifyExpiring({ ...base, clicks: 100, maxClicks: 100 }, now, 7)).toBeNull()
  })
  it('prefers time reason when both apply', () => {
    expect(classifyExpiring({ ...base, expiresAt: days(1), clicks: 90, maxClicks: 100 }, now, 7)?.reason).toBe('time')
  })
  it('parses horizon', () => {
    expect(parseHorizonDays(null)).toBe(7)
    expect(parseHorizonDays('90')).toBe(90)
    expect(parseHorizonDays('0')).toBeNull()
    expect(parseHorizonDays('91')).toBeNull()
    expect(parseHorizonDays('1.5')).toBeNull()
  })
})
