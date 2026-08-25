import { describe, expect, it } from 'vitest'
import {
  analyzeExperiment,
  bayesianProbabilityToBeatControl,
  compareTwoProportions,
  normalCdf,
  wilsonConfidenceInterval,
  type VariantStats,
} from './stats'

describe('stats library', () => {
  it('computes accurate standard normal CDF', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 4)
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3)
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3)
    expect(normalCdf(2.576)).toBeCloseTo(0.995, 3)
  })

  it('calculates Wilson score confidence intervals accurately', () => {
    // 0 clicks edge case
    expect(wilsonConfidenceInterval(0, 0)).toEqual([0, 0])

    // 10 conversions out of 100 clicks
    const [low, high] = wilsonConfidenceInterval(10, 100)
    expect(low).toBeGreaterThan(0.04)
    expect(low).toBeLessThan(0.07)
    expect(high).toBeGreaterThan(0.14)
    expect(high).toBeLessThan(0.18)

    // 100% conversion
    const [fullLow, fullHigh] = wilsonConfidenceInterval(50, 50)
    expect(fullHigh).toBe(1)
    expect(fullLow).toBeGreaterThan(0.9)
  })

  it('compares two proportions and calculates Z-score & p-value', () => {
    const control = { clicks: 1000, conversions: 50 } // 5% CVR
    const variant = { clicks: 1000, conversions: 100 } // 10% CVR (doubled!)

    const result = compareTwoProportions(control, variant)
    expect(result.zScore).toBeGreaterThan(3.5)
    expect(result.pValue).toBeLessThan(0.001)
    expect(result.relativeUplift).toBeCloseTo(1.0, 2) // +100% uplift
    expect(result.absoluteUplift).toBeCloseTo(0.05, 3)
  })

  it('handles insufficient data in proportion comparison', () => {
    const control = { clicks: 10, conversions: 1 }
    const variant = { clicks: 12, conversions: 2 }

    const result = compareTwoProportions(control, variant)
    expect(result.zScore).toBeNull()
    expect(result.pValue).toBeNull()
  })

  it('calculates Bayesian probability of beating control', () => {
    // Clear winner
    const probWinner = bayesianProbabilityToBeatControl(
      { clicks: 500, conversions: 25 }, // 5%
      { clicks: 500, conversions: 60 }  // 12%
    )
    expect(probWinner).toBeGreaterThan(0.99)

    // Equal conversion
    const probEqual = bayesianProbabilityToBeatControl(
      { clicks: 200, conversions: 20 },
      { clicks: 200, conversions: 20 }
    )
    expect(probEqual).toBeCloseTo(0.5, 1)

    // Clear loser
    const probLoser = bayesianProbabilityToBeatControl(
      { clicks: 500, conversions: 50 }, // 10%
      { clicks: 500, conversions: 20 }  // 4%
    )
    expect(probLoser).toBeLessThan(0.01)
  })

  it('analyzes multi-variant experiments and identifies significant winners', () => {
    const variants: VariantStats[] = [
      { id: 'control', name: 'Original Landing Page', clicks: 800, conversions: 40, conversionRate: 0.05, valueCents: 4000 },
      { id: 'var-b', name: 'Hero CTA Variant B', clicks: 800, conversions: 90, conversionRate: 0.1125, valueCents: 9000 },
      { id: 'var-c', name: 'Minimalist Variant C', clicks: 20, conversions: 1, conversionRate: 0.05, valueCents: 100 },
    ]

    const analysis = analyzeExperiment(variants)
    expect(analysis.controlId).toBe('control')
    expect(analysis.hasSignificantWinner).toBe(true)
    expect(analysis.leadingVariantId).toBe('var-b')

    const winnerResult = analysis.results.find((r) => r.variantId === 'var-b')
    expect(winnerResult?.isSignificantWinner).toBe(true)
    expect(winnerResult?.status).toBe('winner')
    expect(winnerResult?.bayesianProbabilityToBeatControl).toBeGreaterThan(0.99)

    const smallSampleResult = analysis.results.find((r) => r.variantId === 'var-c')
    expect(smallSampleResult?.status).toBe('insufficient_data')
  })
})
