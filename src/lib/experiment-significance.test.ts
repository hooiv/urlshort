import { describe, expect, it } from 'vitest'
import { analyzeExperiment, normalCdf, twoProportionPValue, wilsonInterval } from './experiment-significance'

describe('experiment significance', () => {
  it('normalCdf matches known values', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6)
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3)
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3)
  })
  it('p-value of identical rates is 1 and of a big gap is tiny', () => {
    expect(twoProportionPValue(50, 1000, 50, 1000)).toBeCloseTo(1, 6)
    expect(twoProportionPValue(50, 1000, 100, 1000)!).toBeLessThan(0.001)
    expect(twoProportionPValue(0, 100, 0, 100)).toBeNull()
  })
  it('wilson interval brackets the rate', () => {
    const [lo, hi] = wilsonInterval(50, 1000)
    expect(lo).toBeLessThan(0.05); expect(hi).toBeGreaterThan(0.05)
    expect(wilsonInterval(0, 0)).toEqual([0, 0])
  })
  it('declares a significant winner', () => {
    const r = analyzeExperiment([{ id: 'a', name: 'A', clicks: 1000, conversions: 50 }, { id: 'b', name: 'B', clicks: 900, conversions: 90 }])
    expect(r.status).toBe('winner'); expect(r.winnerId).toBe('b')
    expect(r.control).toBe('a')
    expect(r.variants.find((v) => v.id === 'b')!.lift).toBeCloseTo(1, 1)
  })
  it('refuses a verdict on small samples', () => {
    const r = analyzeExperiment([{ id: 'a', name: 'A', clicks: 30, conversions: 1 }, { id: 'b', name: 'B', clicks: 30, conversions: 9 }])
    expect(r.status).toBe('insufficient_data'); expect(r.winnerId).toBeNull()
  })
  it('reports no difference for similar rates', () => {
    const r = analyzeExperiment([{ id: 'a', name: 'A', clicks: 1000, conversions: 50 }, { id: 'b', name: 'B', clicks: 1000, conversions: 53 }])
    expect(r.status).toBe('no_significant_difference')
  })
  it('control can win, and a named control is honoured', () => {
    const rows = [{ id: 'a', name: 'A', clicks: 1000, conversions: 100 }, { id: 'b', name: 'B', clicks: 800, conversions: 40 }]
    expect(analyzeExperiment(rows).winnerId).toBe('a')
    expect(analyzeExperiment(rows, { controlId: 'b' }).winnerId).toBe('a')
  })
  it('clamps conversions to clicks and validates confidence', () => {
    const r = analyzeExperiment([{ id: 'a', name: 'A', clicks: 10, conversions: 50 }, { id: 'b', name: 'B', clicks: 10, conversions: 0 }])
    expect(r.variants[0].rate).toBe(1)
    expect(() => analyzeExperiment([], { confidence: 1 })).toThrow(RangeError)
  })
  it('single variant is insufficient', () => {
    expect(analyzeExperiment([{ id: 'a', name: 'A', clicks: 500, conversions: 20 }]).status).toBe('insufficient_data')
  })
})

import { normalInv, requiredClicksPerVariant, daysToSampleSize } from './experiment-significance'

describe('sample size planner', () => {
  it('inverts the normal cdf', () => {
    expect(normalInv(0.975)).toBeCloseTo(1.95996, 4)
    expect(normalInv(0.8)).toBeCloseTo(0.84162, 4)
    expect(normalInv(0.01)).toBeCloseTo(-2.32635, 4)
    expect(() => normalInv(0)).toThrow()
  })
  it('matches the textbook figure for 10% -> 12%', () => {
    const plan = requiredClicksPerVariant(0.1, 0.2)!
    expect(plan.clicksPerVariant).toBeGreaterThan(3750)
    expect(plan.clicksPerVariant).toBeLessThan(3900)
  })
  it('rejects invalid inputs', () => {
    expect(requiredClicksPerVariant(0, 0.1)).toBeNull()
    expect(requiredClicksPerVariant(0.5, 1.5)).toBeNull()
    expect(requiredClicksPerVariant(0.1, 0)).toBeNull()
  })
  it('estimates days remaining from the slowest variant', () => {
    const plan = requiredClicksPerVariant(0.1, 0.2)!
    const d = daysToSampleSize(plan, [{ clicks: 1000 }, { clicks: 500 }], 10)!
    expect(d).toBe(Math.ceil((plan.clicksPerVariant - 500) / 50))
    expect(daysToSampleSize(plan, [{ clicks: 0 }], 10)).toBeNull()
  })
})
