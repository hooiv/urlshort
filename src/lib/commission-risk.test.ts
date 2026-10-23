import { describe, expect, it } from 'vitest'
import { scoreCommissionRisk, riskLevel, type RiskInput } from './commission-risk'

const base = new Date('2026-10-01T12:00:00Z')
const row = (o: Partial<RiskInput> & { commissionId: string }): RiskInput => ({
  conversionId: `cv-${o.commissionId}`, urlId: 'u1', conversionAt: base, clickAt: new Date(base.getTime() - 60 * 60_000), visitorIdHash: null, ip: null, ...o,
})

describe('scoreCommissionRisk', () => {
  it('leaves a normal conversion low risk', () => {
    expect(scoreCommissionRisk([row({ commissionId: 'a', visitorIdHash: 'v', ip: '1.1.1.1' })])[0]).toMatchObject({ level: 'low', score: 0, signals: [] })
  })
  it('flags instant and click-less conversions', () => {
    const [a, b] = scoreCommissionRisk([row({ commissionId: 'a', clickAt: new Date(base.getTime() - 500) }), row({ commissionId: 'b', clickAt: null })])
    expect(a.signals).toEqual(['instant_conversion'])
    expect(b.signals).toEqual(['no_click'])
  })
  it('flags repeat visitors and ip clusters per link only', () => {
    const rows = [1, 2, 3, 4].map((i) => row({ commissionId: `r${i}`, visitorIdHash: 'v', ip: '9.9.9.9', conversionAt: new Date(base.getTime() + i * 86_400_000) }))
    rows.push(row({ commissionId: 'other', urlId: 'u2', visitorIdHash: 'v', ip: '9.9.9.9' }))
    const res = scoreCommissionRisk(rows)
    expect(res[0].signals).toEqual(['repeat_visitor', 'single_ip_cluster'])
    expect(res[0].level).toBe('high')
    expect(res[4].signals).toEqual([])
  })
  it('flags bursts within the window', () => {
    const rows = [0, 1, 2, 3, 4].map((i) => row({ commissionId: `b${i}`, conversionAt: new Date(base.getTime() + i * 60_000) }))
    expect(scoreCommissionRisk(rows).every((r) => r.signals.includes('burst'))).toBe(true)
  })
  it('maps score to level', () => {
    expect([riskLevel(0), riskLevel(30), riskLevel(60)]).toEqual(['low', 'medium', 'high'])
  })
})
