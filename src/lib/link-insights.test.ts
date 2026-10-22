import { describe, expect, it } from 'vitest'
import { buildInsights, parseInsightDays } from './link-insights'

const flat = (n: number, v: number) => new Array(n).fill(v)
const base = { days: 30, dailyClicks: flat(30, 5), countries: [], devices: [], referrers: [], bots: 0, humans: 150 }

describe('parseInsightDays', () => {
  it('defaults and validates', () => {
    expect(parseInsightDays(null)).toBe(30)
    expect(parseInsightDays('7')).toBe(7)
    expect(parseInsightDays('6')).toBeNull()
    expect(parseInsightDays('91')).toBeNull()
    expect(parseInsightDays('x')).toBeNull()
  })
})
describe('buildInsights', () => {
  it('reports low volume only when too little data', () => {
    const r = buildInsights({ ...base, dailyClicks: flat(30, 0).map((_, i) => (i === 3 ? 4 : 0)), humans: 4 })
    expect(r.map((i) => i.id)).toEqual(['low-volume'])
  })
  it('flags growth and decline', () => {
    const up = [...flat(15, 2), ...flat(15, 6)]
    expect(buildInsights({ ...base, dailyClicks: up }).map((i) => i.id)).toContain('growing')
    const down = [...flat(15, 6), ...flat(15, 2)]
    const d = buildInsights({ ...base, dailyClicks: down }).find((i) => i.id === 'declining')!
    expect(d.data.change).toBe(-66.7)
  })
  it('flags new traction after a quiet start', () => {
    const s = [...flat(15, 0), ...flat(15, 2)]
    expect(buildInsights({ ...base, dailyClicks: s, humans: 30 }).map((i) => i.id)).toContain('new-traction')
  })
  it('flags burst, concentration, skew, referrer and bots', () => {
    const burst = flat(30, 1); burst[10] = 100
    const ids = buildInsights({
      ...base, dailyClicks: burst, humans: 129, bots: 100,
      countries: [{ key: 'IN', clicks: 100 }, { key: 'US', clicks: 29 }],
      devices: [{ key: 'mobile', clicks: 120 }, { key: 'desktop', clicks: 9 }],
      referrers: [{ key: 't.co', clicks: 80 }, { key: '', clicks: 40 }],
    }).map((i) => i.id)
    expect(ids).toEqual(expect.arrayContaining(['bot-heavy', 'single-day-burst', 'country-concentrated', 'device-skew', 'referrer-dependent']))
  })
  it('is quiet for balanced steady traffic', () => {
    expect(buildInsights({ ...base, countries: [{ key: 'IN', clicks: 50 }, { key: 'US', clicks: 50 }, { key: 'DE', clicks: 50 }] })).toEqual([])
  })
})
