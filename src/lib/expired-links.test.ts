import { describe, expect, it } from 'vitest'
import { expiredReason, parseExpiredLimit } from './expired-links'

const now = new Date('2026-10-23T10:00:00Z')
describe('expired-links', () => {
  it('parses limit strictly', () => {
    expect(parseExpiredLimit(null)).toBe(50)
    expect(parseExpiredLimit('200')).toBe(200)
    expect(parseExpiredLimit('201')).toBeNull()
    expect(parseExpiredLimit('0')).toBeNull()
    expect(parseExpiredLimit('1e2')).toBeNull()
  })
  it('classifies reasons, date first', () => {
    expect(expiredReason({ expiresAt: new Date('2026-10-23T09:00:00Z'), clicks: 5, maxClicks: 5 }, now)).toBe('expired')
    expect(expiredReason({ expiresAt: new Date('2026-10-24T09:00:00Z'), clicks: 5, maxClicks: 5 }, now)).toBe('click_limit')
    expect(expiredReason({ expiresAt: null, clicks: 4, maxClicks: 5 }, now)).toBeNull()
    expect(expiredReason({ expiresAt: new Date('2026-10-23T10:00:00Z'), clicks: 0, maxClicks: null }, now)).toBe('expired')
  })
})
