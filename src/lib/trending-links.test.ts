import { describe, expect, it } from 'vitest'
import { parseTrendingDays, parseTrendingDirection, parseTrendingLimit, rankTrending } from './trending-links'

const row = (shortCode: string, current: number, previous: number) => ({ id: shortCode, shortCode, title: null, originalUrl: 'https://x.test', current: BigInt(current), previous: BigInt(previous) })

describe('trending links', () => {
  it('parses params strictly', () => {
    expect(parseTrendingDays(null)).toBe(7)
    expect(parseTrendingDays('30')).toBe(30)
    expect(parseTrendingDays('5')).toBeNull()
    expect(parseTrendingDays('7d')).toBeNull()
    expect(parseTrendingLimit('50')).toBe(50)
    expect(parseTrendingLimit('51')).toBeNull()
    expect(parseTrendingLimit('0')).toBeNull()
    expect(parseTrendingDirection('falling')).toBe('falling')
    expect(parseTrendingDirection('up')).toBeNull()
  })
  it('ranks by absolute gain, ignoring tiny links', () => {
    const r = rankTrending([row('big', 900, 500), row('tiny', 4, 1), row('mid', 60, 10), row('flat', 50, 50), row('drop', 10, 90)], 'rising', 10)
    expect(r.map((x) => x.shortCode)).toEqual(['big', 'mid'])
    expect(r[1]).toMatchObject({ delta: 50, changePercent: 500 })
  })
  it('ranks falling links by largest loss and marks brand-new links', () => {
    expect(rankTrending([row('drop', 10, 90), row('small', 5, 12)], 'falling', 10).map((x) => x.shortCode)).toEqual(['drop', 'small'])
    expect(rankTrending([row('new', 20, 0)], 'rising', 10)[0].changePercent).toBeNull()
  })
  it('applies the limit', () => {
    expect(rankTrending([row('a', 30, 0), row('b', 20, 0), row('c', 10, 0)], 'rising', 2).map((x) => x.shortCode)).toEqual(['a', 'b'])
  })
})
