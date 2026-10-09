import { describe, expect, it, vi } from 'vitest'
vi.mock('./prisma', () => ({ prisma: {} }))
import { dateKeys, percentChange, previousWindow, resolveWindow } from './aggregate-analytics'

const now = new Date('2026-10-09T15:00:00Z')

describe('resolveWindow', () => {
  it('resolves presets as inclusive UTC day windows', () => {
    expect(resolveWindow({ range: '7d' }, now)).toEqual({ from: '2026-10-03', to: '2026-10-09', days: 7 })
    expect(resolveWindow({ range: 'bogus' }, now).days).toBe(30)
  })

  it('accepts explicit ranges and rejects bad or huge ones', () => {
    expect(resolveWindow({ from: '2026-01-01', to: '2026-01-31' }, now)).toEqual({ from: '2026-01-01', to: '2026-01-31', days: 31 })
    expect(() => resolveWindow({ from: '2026-02-01', to: '2026-01-01' }, now)).toThrow('Invalid date range')
    expect(() => resolveWindow({ from: '2020-01-01', to: '2026-01-01' }, now)).toThrow(/too large/)
    expect(() => resolveWindow({ from: '01/02/2026' }, now)).toThrow(/YYYY-MM-DD/)
  })
})

describe('window helpers', () => {
  it('builds the preceding window and gap-free keys', () => {
    expect(previousWindow({ from: '2026-10-03', to: '2026-10-09', days: 7 })).toEqual({ from: '2026-09-26', to: '2026-10-02', days: 7 })
    expect(dateKeys({ from: '2026-02-27', to: '2026-03-01', days: 3 })).toEqual(['2026-02-27', '2026-02-28', '2026-03-01'])
  })

  it('reports percentage change without dividing by zero', () => {
    expect(percentChange(150, 100)).toBe(50)
    expect(percentChange(0, 0)).toBe(0)
    expect(percentChange(5, 0)).toBeNull()
    expect(percentChange(1, 3)).toBe(-66.7)
  })
})
