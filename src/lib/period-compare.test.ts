import { describe, expect, it } from 'vitest'
import { buildComparison, parseCompareDays } from './period-compare'

const now = new Date('2026-10-12T12:00:00Z')

describe('parseCompareDays', () => {
  it('defaults, bounds and rejects junk', () => {
    expect(parseCompareDays(null)).toBe(30)
    expect(parseCompareDays('7')).toBe(7)
    expect(parseCompareDays('180')).toBe(180)
    expect(parseCompareDays('181')).toBeNull()
    expect(parseCompareDays('0')).toBeNull()
    expect(parseCompareDays('7.5')).toBeNull()
    expect(parseCompareDays('-3')).toBeNull()
  })
})

describe('buildComparison', () => {
  it('splits windows and aligns the series', () => {
    const r = buildComparison([{ offset: 0, clicks: 4 }, { offset: 6, clicks: 1 }, { offset: 7, clicks: 10 }, { offset: 13, clicks: 2 }], 7, now)
    expect(r.previous.clicks).toBe(5)
    expect(r.current.clicks).toBe(12)
    expect(r.changePercent).toBe(140)
    expect(r.series).toHaveLength(7)
    expect(r.series[0]).toEqual({ day: 1, current: 10, previous: 4 })
    expect(r.series[6]).toEqual({ day: 7, current: 2, previous: 1 })
  })
  it('returns null growth when previous is empty and drops out-of-range rows', () => {
    const r = buildComparison([{ offset: 8, clicks: 3 }, { offset: 14, clicks: 9 }, { offset: -1, clicks: 9 }, { offset: 9, clicks: 0 }], 7, now)
    expect(r.changePercent).toBeNull()
    expect(r.current.clicks).toBe(3)
  })
  it('reports a drop as negative', () => {
    expect(buildComparison([{ offset: 1, clicks: 10 }, { offset: 8, clicks: 5 }], 7, now).changePercent).toBe(-50)
  })
  it('window boundaries are contiguous', () => {
    const r = buildComparison([], 30, now)
    expect(r.previous.to).toBe(r.current.from)
    expect(r.current.to).toBe(now.toISOString())
  })
})
