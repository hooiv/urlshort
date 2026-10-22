import { describe, it, expect } from 'vitest'
import { analyzeExperiment } from './experiment-significance'
import { bayesianReport } from './experiment-bayesian'
import { decideExperiment } from './experiment-decision'

const plan = (n: number) => ({ baselineRate: 0.05, relativeLift: 0.1, confidence: 0.95, power: 0.8, clicksPerVariant: n })
const run = (a: [number, number], b: [number, number], n: number | null) => {
  const v = [{ id: 'a', name: 'A', clicks: a[0], conversions: a[1] }, { id: 'b', name: 'B', clicks: b[0], conversions: b[1] }]
  const r = analyzeExperiment(v)
  return decideExperiment(r, bayesianReport(v, r.control!), n === null ? null : plan(n))
}

describe('decideExperiment', () => {
  it('keeps running with insufficient data', () => expect(run([10, 1], [10, 2], 1000).action).toBe('keep_running'))
  it('ships the winner once planned sample is reached', () => {
    const d = run([2000, 100], [2000, 200], 1500)
    expect(d).toMatchObject({ action: 'ship_variant', variantId: 'b' })
  })
  it('ships early only on strong Bayesian evidence with low loss', () => {
    const d = run([20000, 1000], [20000, 1400], 30000)
    expect(d).toMatchObject({ action: 'ship_variant', variantId: 'b' })
  })
  it('refuses to stop early on a marginal significant result', () => {
    const d = run([300, 15], [300, 33], 100000)
    expect(d.action).toBe('keep_running')
  })
  it('declares no effect after the planned sample', () => {
    expect(run([5000, 250], [5000, 252], 4000).action).toBe('stop_no_effect')
  })
  it('keeps control when it outperforms', () => {
    expect(run([2000, 200], [2000, 100], 1500)).toMatchObject({ action: 'keep_control', variantId: 'a' })
  })
})
