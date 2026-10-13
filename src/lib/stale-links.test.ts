import { describe, expect, it } from 'vitest'
import { parseStaleDays, parseStaleLimit, shapeStale } from './stale-links'

describe('stale links', () => {
  it('parses days and limit strictly', () => {
    expect(parseStaleDays(null)).toBe(90)
    expect(parseStaleDays('30')).toBe(30)
    expect(parseStaleDays('45')).toBeNull()
    expect(parseStaleDays('1e2')).toBeNull()
    expect(parseStaleLimit('')).toBe(50)
    expect(parseStaleLimit('200')).toBe(200)
    expect(parseStaleLimit('201')).toBeNull()
    expect(parseStaleLimit('0')).toBeNull()
  })
  it('counts idle days from last click, else creation', () => {
    const now = new Date('2026-10-13T00:00:00Z')
    const rows = shapeStale([
      { id: 'a', shortCode: 'a', title: null, originalUrl: 'https://x.test', createdAt: new Date('2026-01-01T00:00:00Z'), clicks: 3, lastClick: new Date('2026-07-05T00:00:00Z'), total: 3n },
      { id: 'b', shortCode: 'b', title: null, originalUrl: 'https://y.test', createdAt: new Date('2026-09-13T00:00:00Z'), clicks: 0, lastClick: null, total: 0 },
    ], now)
    expect(rows[0]).toMatchObject({ idleDays: 100, totalClicks: 3 })
    expect(rows[1]).toMatchObject({ idleDays: 30, lastClickAt: null })
  })
})
