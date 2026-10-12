import { describe, expect, it } from 'vitest'
import { buildHeatmap, isValidTimezone, parseHeatmapDays } from './click-heatmap'

describe('click heatmap', () => {
  it('validates timezones', () => {
    expect(isValidTimezone('Asia/Kolkata')).toBe(true)
    expect(isValidTimezone('UTC')).toBe(true)
    expect(isValidTimezone('Mars/Base')).toBe(false)
    expect(isValidTimezone('')).toBe(false)
    expect(isValidTimezone('x'.repeat(65))).toBe(false)
  })

  it('parses day windows strictly', () => {
    expect(parseHeatmapDays(null)).toBe(30)
    expect(parseHeatmapDays('90')).toBe(90)
    expect(parseHeatmapDays('91')).toBeNull()
    expect(parseHeatmapDays('0')).toBeNull()
    expect(parseHeatmapDays('7.5')).toBeNull()
    expect(parseHeatmapDays('-3')).toBeNull()
  })

  it('builds a dense grid and ranks slots with stable tie-breaks', () => {
    const h = buildHeatmap([
      { day: 2, hour: 9, clicks: 5 }, { day: 1, hour: 20, clicks: 5 }, { day: 6, hour: 0, clicks: 2 }, { day: 2, hour: 9, clicks: 1 }, { day: 0, hour: 3, clicks: 1 },
    ], 'UTC', 30)
    expect(h.grid).toHaveLength(7)
    expect(h.grid[0]).toHaveLength(24)
    expect(h.total).toBe(14)
    expect(h.grid[2][9]).toBe(6)
    expect(h.topSlots).toEqual([{ day: 2, hour: 9, clicks: 6 }, { day: 1, hour: 20, clicks: 5 }, { day: 6, hour: 0, clicks: 2 }])
    expect(h.peak).toEqual(h.topSlots[0])
  })

  it('ignores malformed rows and handles empty data', () => {
    const h = buildHeatmap([{ day: 7, hour: 1, clicks: 3 }, { day: 1, hour: 24, clicks: 3 }, { day: 1, hour: 1, clicks: 0 }, { day: 1.5, hour: 1, clicks: 2 }], 'UTC', 7)
    expect(h.total).toBe(0)
    expect(h.peak).toBeNull()
    expect(h.topSlots).toEqual([])
  })
})
