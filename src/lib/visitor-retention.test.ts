import { describe, expect, it } from 'vitest'
import { buildVisitorRetention, parseVisitorDays } from './visitor-retention'

describe('visitor retention', () => {
  it('parses days strictly', () => {
    expect(parseVisitorDays(null)).toBe(30)
    expect(parseVisitorDays('365')).toBe(365)
    expect(parseVisitorDays('0')).toBeNull()
    expect(parseVisitorDays('366')).toBeNull()
    expect(parseVisitorDays('7.5')).toBeNull()
  })
  it('derives rates', () => {
    expect(buildVisitorRetention({ days: 7, uniqueVisitors: 8, returningVisitors: 2, hashedClicks: 20, anonymousClicks: 3 })).toEqual({
      days: 7, uniqueVisitors: 8, newVisitors: 6, returningVisitors: 2, returningRate: 25, clicksPerVisitor: 2.5, anonymousClicks: 3,
    })
  })
  it('handles empty and clamps inconsistent counts', () => {
    const e = buildVisitorRetention({ days: 7, uniqueVisitors: 0, returningVisitors: 0, hashedClicks: 0, anonymousClicks: 0 })
    expect(e.returningRate).toBe(0)
    expect(buildVisitorRetention({ days: 7, uniqueVisitors: 2, returningVisitors: 5, hashedClicks: 2, anonymousClicks: 0 }).newVisitors).toBe(0)
  })
})
