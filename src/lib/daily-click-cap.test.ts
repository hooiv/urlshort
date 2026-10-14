import { describe, expect, it, vi } from 'vitest'
import { parseDailyClickCap, reserveDailyClick } from './daily-click-cap'

describe('parseDailyClickCap', () => {
  it('clears on empty', () => {
    expect(parseDailyClickCap(null)).toBeNull()
    expect(parseDailyClickCap('')).toBeNull()
    expect(parseDailyClickCap(undefined)).toBeNull()
  })
  it('accepts positive integers', () => {
    expect(parseDailyClickCap('250')).toBe(250)
    expect(parseDailyClickCap(1)).toBe(1)
  })
  it('rejects zero, negatives, fractions, junk and huge values', () => {
    for (const v of [0, -1, 1.5, 'abc', 10_000_001]) expect(() => parseDailyClickCap(v)).toThrow()
  })
})

describe('reserveDailyClick', () => {
  it('maps affected rows to admission', async () => {
    const db = { $executeRaw: vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0) }
    expect(await reserveDailyClick(db as never, 'u1', 5, '2026-10-14')).toBe(true)
    expect(await reserveDailyClick(db as never, 'u1', 5, '2026-10-14')).toBe(false)
  })
})
