import { describe, expect, it } from 'vitest'
import { parseQualityDays, rankSuspicious, summarizeTotals } from './traffic-quality'

describe('traffic quality', () => {
  it('parses days', () => {
    expect(parseQualityDays(null)).toBe(7)
    expect(parseQualityDays('30')).toBe(30)
    expect(parseQualityDays('5')).toBeNull()
    expect(parseQualityDays('x')).toBeNull()
  })
  it('summarizes totals and non-human percent', () => {
    const t = summarizeTotals([{ trafficType: 'human', n: 6n }, { trafficType: 'bot', n: 3 }, { trafficType: 'ai_agent', n: 1n }, { trafficType: 'weird', n: 99 }])
    expect(t).toEqual({ human: 6, bot: 3, ai_agent: 1, total: 10, nonHumanPercent: 40 })
    expect(summarizeTotals([]).nonHumanPercent).toBe(0)
  })
  it('ranks suspicious links by share, ignoring low volume and clean links', () => {
    const rows = [
      { id: '1', shortCode: 'a', title: null, total: 100, nonhuman: 10 },
      { id: '2', shortCode: 'b', title: null, total: 50n, nonhuman: 40n },
      { id: '3', shortCode: 'c', title: null, total: 5, nonhuman: 5 },
      { id: '4', shortCode: 'd', title: null, total: 90, nonhuman: 0 },
    ]
    expect(rankSuspicious(rows).map((r) => r.shortCode)).toEqual(['b', 'a'])
    expect(rankSuspicious(rows)[0].nonHumanPercent).toBe(80)
  })
})
