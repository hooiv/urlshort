import { describe, expect, it } from 'vitest'
import { parseTarget, projectClicks } from './click-forecast'

const today = new Date('2026-10-15T10:00:00Z')

describe('parseTarget', () => {
  it('handles absent, valid and invalid values', () => {
    expect(parseTarget(null)).toBeUndefined()
    expect(parseTarget('500')).toBe(500)
    expect(parseTarget('0')).toBeNull()
    expect(parseTarget('-3')).toBeNull()
    expect(parseTarget('1e3')).toBeNull()
    expect(parseTarget('1000000001')).toBeNull()
  })
})

describe('projectClicks', () => {
  it('projects flat pace to a date', () => {
    const r = projectClicks(Array(14).fill(10), 100, 200, today)
    expect(r.dailyAverage).toBe(10)
    expect(r.trend).toBe(0)
    expect(r.daysToTarget).toBe(10)
    expect(r.projectedDate).toBe('2026-10-25')
    expect(r.projectedNext7Days).toBe(70)
  })
  it('accelerating series beats flat pace', () => {
    const up = Array.from({ length: 14 }, (_, i) => i)
    const r = projectClicks(up, 0, 100, today)
    expect(r.trend).toBeGreaterThan(0)
    expect(r.projectedNext7Days).toBeGreaterThan(Math.round(r.dailyAverage * 7))
  })
  it('zero traffic is unreachable, reached target is today', () => {
    expect(projectClicks(Array(14).fill(0), 5, 50, today).daysToTarget).toBeNull()
    const done = projectClicks(Array(14).fill(1), 60, 50, today)
    expect(done.daysToTarget).toBe(0)
    expect(done.projectedDate).toBe('2026-10-15')
  })
  it('never forecasts negative pace and omits target fields', () => {
    const down = Array.from({ length: 14 }, (_, i) => 100 - i * 8)
    const r = projectClicks(down, 0, undefined, today)
    expect(r.projectedNext7Days).toBeGreaterThanOrEqual(0)
    expect(r.target).toBeNull()
    expect(r.daysToTarget).toBeNull()
  })
})
