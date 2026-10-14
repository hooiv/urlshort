import { describe, expect, it } from 'vitest'
import { fillDaily, parseQrDays, percentOf, rankQrLinks } from './qr-scans'

describe('qr-scans', () => {
  it('parses days', () => {
    expect(parseQrDays(null)).toBe(30)
    expect(parseQrDays('7')).toBe(7)
    expect(parseQrDays('8')).toBeNull()
    expect(parseQrDays('abc')).toBeNull()
  })
  it('computes percent with rounding and zero guard', () => {
    expect(percentOf(1, 3)).toBe(33.3)
    expect(percentOf(0, 0)).toBe(0)
  })
  it('ranks links with scans only, ties by code', () => {
    const r = rankQrLinks([
      { id: '1', shortCode: 'b', title: null, scans: 5n, total: 10n },
      { id: '2', shortCode: 'a', title: null, scans: 5, total: 20 },
      { id: '3', shortCode: 'c', title: null, scans: 0, total: 99 },
      { id: '4', shortCode: 'd', title: 'D', scans: 9, total: 9 },
    ])
    expect(r.map((x) => x.shortCode)).toEqual(['d', 'a', 'b'])
    expect(r[0].scanPercent).toBe(100)
    expect(r[2].scanPercent).toBe(50)
  })
  it('fills missing days oldest first', () => {
    const now = new Date('2026-10-14T12:00:00Z')
    const out = fillDaily([{ day: '2026-10-13', scans: 4 }], 3, now)
    expect(out).toEqual([{ day: '2026-10-12', scans: 0 }, { day: '2026-10-13', scans: 4 }, { day: '2026-10-14', scans: 0 }])
  })
})
