import { describe, expect, it } from 'vitest'
import { leadConfidence, buildCompare, dayRange, parseCompareCodes, parseCompareDays } from './link-compare'

describe('link compare', () => {
  it('validates codes and days', () => {
    expect(parseCompareCodes('a,b')).toEqual(['a', 'b'])
    expect(parseCompareCodes('a,a')).toBeNull()
    expect(parseCompareCodes('a')).toBeNull()
    expect(parseCompareCodes('a,b,c,d,e,f')).toBeNull()
    expect(parseCompareCodes('a,b/c')).toBeNull()
    expect(parseCompareDays(null)).toBe(30)
    expect(parseCompareDays('14')).toBe(14)
    expect(parseCompareDays('15')).toBeNull()
  })
  it('builds an inclusive UTC day range', () => {
    expect(dayRange(3, new Date('2026-10-14T23:59:00Z'))).toEqual(['2026-10-12', '2026-10-13', '2026-10-14'])
  })
  it('zero-fills, totals, finds peak and leader, reports missing', () => {
    const days = dayRange(3, new Date('2026-10-14T10:00:00Z'))
    const r = buildCompare(['a', 'b', 'ghost'], [{ shortCode: 'a', title: null }, { shortCode: 'b', title: 'B' }],
      [{ shortCode: 'a', title: null, day: '2026-10-13', clicks: BigInt(7) }, { shortCode: 'b', title: 'B', day: '2026-10-14', clicks: 2 }, { shortCode: 'a', title: null, day: '2026-01-01', clicks: 99 }], days)
    expect(r.links[0]).toMatchObject({ shortCode: 'a', total: 7, peakDay: '2026-10-13', daily: [0, 7, 0] })
    expect(r.links[1].daily).toEqual([0, 0, 2])
    expect(r.missing).toEqual(['ghost'])
    expect(r.leader).toBe('a')
  })
  it('has no leader on a tie or no clicks', () => {
    const days = dayRange(2, new Date('2026-10-14T10:00:00Z'))
    const f = [{ shortCode: 'a', title: null }, { shortCode: 'b', title: null }]
    expect(buildCompare(['a', 'b'], f, [], days).leader).toBeNull()
    expect(buildCompare(['a', 'b'], f, [{ shortCode: 'a', title: null, day: days[0], clicks: 1 }, { shortCode: 'b', title: null, day: days[1], clicks: 1 }], days).leader).toBeNull()
  })
})

describe('leadConfidence', () => {
  it('is null for tiny samples and non-leads', () => {
    expect(leadConfidence(5, 3)).toBeNull()
    expect(leadConfidence(50, 50)).toBeNull()
  })
  it('grows with the gap', () => {
    const close = leadConfidence(110, 100)!
    const wide = leadConfidence(200, 100)!
    expect(close).toBeLessThan(0.85)
    expect(wide).toBeGreaterThan(0.999)
    expect(wide).toBeGreaterThan(close)
  })
})
