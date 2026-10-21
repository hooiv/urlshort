import { describe, it, expect } from 'vitest'
import { analyzeExperiment } from './experiment-significance'
import { promotionVerdict } from './experiment-report'

describe('promotionVerdict', () => {
  const winner = analyzeExperiment([
    { id: 'a', name: 'A', clicks: 2000, conversions: 100 },
    { id: 'b', name: 'B', clicks: 2000, conversions: 200 },
  ])
  it('allows the significant winner', () => expect(promotionVerdict(winner, 'b')).toEqual({ allowed: true }))
  it('refuses a non-winner when another variant won', () => {
    const v = promotionVerdict(winner, 'a')
    expect(v.allowed).toBe(false)
  })
  it('refuses with the analysis note when data is insufficient', () => {
    const r = analyzeExperiment([{ id: 'a', name: 'A', clicks: 10, conversions: 1 }, { id: 'b', name: 'B', clicks: 10, conversions: 2 }])
    const v = promotionVerdict(r, 'b')
    expect(v).toEqual({ allowed: false, reason: r.note })
  })
})
