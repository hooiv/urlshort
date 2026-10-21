import { describe, expect, it } from 'vitest'
import { bayesianReport } from './experiment-bayesian'

const v = (id: string, clicks: number, conversions: number) => ({ id, name: id, clicks, conversions })

describe('bayesianReport', () => {
  it('is confident when a variant clearly wins', () => {
    const r = bayesianReport([v('c', 2000, 100), v('b', 2000, 160)], 'c')
    expect(r.find((x) => x.id === 'b')!.probBeatControl!).toBeGreaterThan(0.99)
  })
  it('is near 50% for identical data', () => {
    const p = bayesianReport([v('c', 1000, 50), v('b', 1000, 50)], 'c')[1].probBeatControl!
    expect(p).toBeGreaterThan(0.4)
    expect(p).toBeLessThan(0.6)
  })
  it('is deterministic and handles control, unknown control, bad counts', () => {
    const a = bayesianReport([v('c', 100, 5), v('b', 100, 9)], 'c')
    expect(a).toEqual(bayesianReport([v('c', 100, 5), v('b', 100, 9)], 'c'))
    expect(a[0]).toEqual({ id: 'c', probBeatControl: null, expectedLoss: 0 })
    expect(bayesianReport([v('c', 1, 0)], 'zzz')).toEqual([])
    const odd = bayesianReport([v('c', 0, 0), v('b', 10, 50)], 'c')
    expect(odd[1].probBeatControl).not.toBeNull()
  })
  it('expected loss is lower for the better variant', () => {
    const [, good, bad] = bayesianReport([v('c', 1000, 50), v('g', 1000, 80), v('x', 1000, 30)], 'c')
    expect(good.expectedLoss).toBeLessThan(bad.expectedLoss)
  })
})
