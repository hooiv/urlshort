import { describe, expect, it } from 'vitest'
import { digestWindow, formatChange, hasActivity, money, renderWeeklyDigest } from './weekly-digest'

const base = {
  window: { from: '2026-10-05', to: '2026-10-11', days: 7 },
  links: 3,
  totals: { clicks: 1234, conversions: 10, revenueCents: 5000, conversionRate: 0.81 },
  previous: { window: { from: '2026-09-28', to: '2026-10-04', days: 7 }, clicks: 1000, conversions: 5, revenueCents: 0 },
  change: { clicks: 23.4, conversions: 100, revenueCents: null },
  revenueByCurrency: [{ currency: 'USD', valueCents: 5000 }],
  timeseries: [],
  topLinks: [{ id: '1', shortCode: 'abc', title: 'Launch', originalUrl: 'https://e.com', clicks: 900, conversions: 4, revenueCents: 0 }],
  tags: [],
  breakdowns: { window: { from: '2026-10-05', to: '2026-10-11' }, humanOnly: true, countries: [{ key: 'US', clicks: 500 }], devices: [], referrers: [{ key: 'news.ycombinator.com', clicks: 300 }] },
} as unknown as Parameters<typeof renderWeeklyDigest>[0]

describe('weekly digest', () => {
  it('uses the last 7 complete UTC days', () => {
    expect(digestWindow(new Date('2026-10-12T08:00:00Z'))).toEqual({ from: '2026-10-05', to: '2026-10-11', days: 7 })
    expect(digestWindow(new Date('2026-10-12T23:59:59Z')).to).toBe('2026-10-11')
    expect(digestWindow(new Date('2027-01-03T00:00:00Z'))).toEqual({ from: '2026-12-27', to: '2027-01-02', days: 7 })
  })
  it('formats changes', () => {
    expect(formatChange(null)).toBe('new')
    expect(formatChange(0)).toBe('flat')
    expect(formatChange(23.4)).toBe('+23%')
    expect(formatChange(-8.6)).toBe('-9%')
  })
  it('formats money and tolerates bad currency codes', () => {
    expect(money(5000, 'USD')).toBe('$50.00')
    expect(money(5000, 'NOPE!')).toBe('50.00 NOPE!')
  })
  it('detects activity', () => {
    expect(hasActivity(base)).toBe(true)
    expect(hasActivity({ ...base, totals: { ...base.totals, clicks: 0, conversions: 0 }, previous: { ...base.previous, clicks: 0 } })).toBe(false)
  })
  it('renders subject and body', () => {
    const { subject, text } = renderWeeklyDigest(base, { name: 'Ann' }, 'https://q.l')
    expect(subject).toBe('1,234 clicks last week (+23%)')
    expect(text).toContain('Hi Ann,')
    expect(text).toContain('1. https://q.l/abc — 900 clicks (Launch)')
    expect(text).toContain('Revenue: $50.00')
    expect(text).toContain('Top country: US (500)')
    expect(text).toContain('https://q.l/account/notifications')
  })
})
