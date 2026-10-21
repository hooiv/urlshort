import { describe, expect, it } from 'vitest'
import { projectCapRunway, runwayDateKeys } from './cap-runway'
import { classifyExpiring } from './expiring-links'

const now = new Date('2026-10-21T08:00:00Z')
const base = { id: 'i', shortCode: 's', originalUrl: 'https://e.com', expiresAt: null, clicks: 10, maxClicks: 1000 }

describe('cap runway', () => {
  it('projects exhaustion from the trailing rate', () => {
    const r = projectCapRunway(100, 70, now)
    expect(r.clicksPerDay).toBe(10)
    expect(r.daysRemaining).toBe(10)
    expect(r.projectedExhaustionAt).toBe('2026-10-31T08:00:00.000Z')
  })
  it('has no projection with zero traffic and 0 days when exhausted', () => {
    expect(projectCapRunway(50, 0, now)).toEqual({ clicksPerDay: 0, daysRemaining: null, projectedExhaustionAt: null })
    expect(projectCapRunway(0, 5, now).daysRemaining).toBe(0)
  })
  it('builds 7 UTC keys ending today', () => {
    const k = runwayDateKeys(now)
    expect(k).toHaveLength(7)
    expect(k[0]).toBe('2026-10-15')
    expect(k[6]).toBe('2026-10-21')
  })
  it('flags a fast-burning cap well below 80%', () => {
    expect(classifyExpiring(base, now, 7, 0)).toBeNull()
    expect(classifyExpiring(base, now, 7, 700)).toBeNull() // 10 days of runway
    const hit = classifyExpiring(base, now, 7, 1400)
    expect(hit?.reason).toBe('clicks')
    expect(hit?.runway?.daysRemaining).toBe(5)
  })
  it('flags when runway fits the horizon', () => {
    const hit = classifyExpiring({ ...base, clicks: 500 }, now, 7, 700)
    expect(hit?.runway?.daysRemaining).toBe(5)
  })
})
