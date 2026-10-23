import { describe, expect, it } from 'vitest'
import { detectReferrerSpam, isKnownSpamHost } from './referrer-spam'
import type { ReferrerStat } from './referrer-performance'

const stat = (o: Partial<ReferrerStat> & { host: string }): ReferrerStat => ({ clicks: 5, visitors: 5, previousClicks: 5, changePct: 0, sharePct: 5, ...o })

describe('referrer spam detection', () => {
  it('matches known domains and subdomains but not lookalike suffixes', () => {
    expect(isKnownSpamHost('semalt.com')).toBe(true)
    expect(isKnownSpamHost('x.semalt.com')).toBe(true)
    expect(isKnownSpamHost('notsemalt.com')).toBe(false)
  })
  it('flags single-source floods only above the click floor', () => {
    const r = detectReferrerSpam([
      stat({ host: 'a.test', clicks: 100, visitors: 3 }),
      stat({ host: 'b.test', clicks: 10, visitors: 1 }),
      stat({ host: 'c.test', clicks: 100, visitors: 80 }),
    ])
    expect(r.map((f) => [f.host, f.signals])).toEqual([['a.test', ['single-source']]])
  })
  it('flags bursts from nothing with dominant share, and ranks multi-signal first', () => {
    const r = detectReferrerSpam([
      stat({ host: 'new.test', clicks: 50, visitors: 40, previousClicks: 0, sharePct: 60 }),
      stat({ host: 'semalt.com', clicks: 30, visitors: 2, previousClicks: 0, sharePct: 45 }),
      stat({ host: 'ok.test', clicks: 50, visitors: 40, previousClicks: 0, sharePct: 10 }),
    ])
    expect(r[0]).toMatchObject({ host: 'semalt.com', signals: ['known-spam', 'single-source', 'burst'] })
    expect(r[1]).toMatchObject({ host: 'new.test', signals: ['burst'] })
    expect(r).toHaveLength(2)
  })
  it('returns nothing for healthy traffic', () => {
    expect(detectReferrerSpam([stat({ host: 'g.test' })])).toEqual([])
  })
})
