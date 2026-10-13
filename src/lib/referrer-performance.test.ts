import { describe, expect, it } from 'vitest'
import { normalizeHost, parseReferrerWindow, shapeReferrerStats } from './referrer-performance'

describe('parseReferrerWindow', () => {
  it('defaults and validates', () => {
    expect(parseReferrerWindow(null)).toBe(30)
    expect(parseReferrerWindow('90')).toBe(90)
    expect(parseReferrerWindow('14')).toBeNull()
  })
})

describe('normalizeHost', () => {
  it('lowercases, strips www and trailing dot, rejects junk', () => {
    expect(normalizeHost(' WWW.Example.com. ')).toBe('example.com')
    expect(normalizeHost('a b')).toBeNull()
    expect(normalizeHost(null)).toBeNull()
  })
})

describe('shapeReferrerStats', () => {
  it('merges www variants and computes change and share', () => {
    const out = shapeReferrerStats([
      { host: 'news.ycombinator.com', clicks: 30n, visitors: 10n, previous: 15n },
      { host: 'www.reddit.com', clicks: 10, visitors: 4, previous: 0 },
      { host: 'reddit.com', clicks: 10, visitors: 1, previous: 0 },
      { host: '', clicks: 99, visitors: 9, previous: 0 },
    ])
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ host: 'news.ycombinator.com', clicks: 30, changePct: 100, sharePct: 60 })
    expect(out[1]).toMatchObject({ host: 'reddit.com', clicks: 20, visitors: 5, changePct: null })
  })
  it('keeps hosts that only had previous traffic', () => {
    expect(shapeReferrerStats([{ host: 'x.com', clicks: 0, visitors: 0, previous: 4 }])[0]).toMatchObject({ changePct: -100, sharePct: 0 })
  })
})
