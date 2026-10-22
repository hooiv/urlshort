import { describe, expect, it } from 'vitest'
import { minimumDetectableLift, normalQuantile, parseSampleSizeInput, planSampleSize } from './experiment-sample-size'

describe('sample size planner', () => {
  it('quantile matches known z values', () => {
    expect(normalQuantile(0.975)).toBeCloseTo(1.95996, 4)
    expect(normalQuantile(0.8)).toBeCloseTo(0.84162, 4)
    expect(normalQuantile(0.5)).toBeCloseTo(0, 8)
    expect(normalQuantile(0.01)).toBeCloseTo(-2.32635, 4)
    expect(() => normalQuantile(1)).toThrow()
  })
  it('matches the textbook figure (5% -> 6%, 95/80 ~ 8155 per arm)', () => {
    const plan = planSampleSize({ baselineRate: 0.05, minRelativeLift: 0.2 })
    expect(plan.perVariantClicks).toBeGreaterThan(8000)
    expect(plan.perVariantClicks).toBeLessThan(8300)
    expect(plan.targetRate).toBeCloseTo(0.06, 10)
    expect(plan.estimatedDays).toBeNull()
  })
  it('more variants need more clicks and estimates days', () => {
    const two = planSampleSize({ baselineRate: 0.1, minRelativeLift: 0.1, dailyClicks: 500 })
    const four = planSampleSize({ baselineRate: 0.1, minRelativeLift: 0.1, variants: 4, dailyClicks: 500 })
    expect(four.perVariantClicks).toBeGreaterThan(two.perVariantClicks)
    expect(two.estimatedDays).toBe(Math.ceil(two.totalClicks / 500))
  })
  it('floors at the report minimum', () => {
    expect(planSampleSize({ baselineRate: 0.1, minRelativeLift: 5 }).perVariantClicks).toBeGreaterThanOrEqual(100)
  })
  it('validates input', () => {
    const q = (s: string) => parseSampleSizeInput(new URLSearchParams(s))
    expect(q('')).toHaveProperty('error')
    expect(q('baselineRate=1.2&minRelativeLift=0.1')).toHaveProperty('error')
    expect(q('baselineRate=0.5&minRelativeLift=2')).toHaveProperty('error')
    expect(q('baselineRate=0.1&minRelativeLift=0.1&variants=1')).toHaveProperty('error')
    expect(q('baselineRate=0.1&minRelativeLift=0.1&power=0.1')).toHaveProperty('error')
    expect(q('baselineRate=0.1&minRelativeLift=0.1&dailyClicks=-3')).toHaveProperty('error')
    expect(q('baselineRate=0.1&minRelativeLift=0.1')).toMatchObject({ confidence: 0.95, power: 0.8, variants: 2 })
  })
})

describe('minimum detectable lift', () => {
  it('round-trips with planSampleSize', () => {
    const plan = planSampleSize({ baselineRate: 0.05, minRelativeLift: 0.2 })
    const lift = minimumDetectableLift({ baselineRate: 0.05, perVariantClicks: plan.perVariantClicks })!
    expect(lift).toBeGreaterThan(0.19)
    expect(lift).toBeLessThanOrEqual(0.2001)
  })
  it('shrinks with more traffic and is null when hopeless', () => {
    const a = minimumDetectableLift({ baselineRate: 0.1, perVariantClicks: 1000 })!
    const b = minimumDetectableLift({ baselineRate: 0.1, perVariantClicks: 10000 })!
    expect(b).toBeLessThan(a)
    expect(minimumDetectableLift({ baselineRate: 0.9, perVariantClicks: 5 })).toBeNull()
    expect(minimumDetectableLift({ baselineRate: 2, perVariantClicks: 100 })).toBeNull()
  })
})
