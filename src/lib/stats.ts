/**
 * Statistical significance and A/B testing inference engine.
 *
 * Implements rigorous frequentist (Two-proportion Z-test, Wilson score confidence
 * intervals) and Bayesian probability calculations for conversion rate experiments.
 */

export interface VariantStats {
  id: string
  name: string
  clicks: number
  conversions: number
  conversionRate: number
  valueCents: number
}

export interface StatisticalResult {
  variantId: string
  name: string
  clicks: number
  conversions: number
  conversionRate: number
  relativeUplift: number // e.g. +0.254 for +25.4%
  absoluteUplift: number // e.g. +0.024 for +2.4 percentage points
  zScore: number | null
  pValue: number | null
  confidenceLevel: number // e.g. 0.95 (95%)
  confidenceInterval: [number, number] // [low, high] 95% Wilson interval
  bayesianProbabilityToBeatControl: number // P(Variant > Control), 0 to 1
  isSignificantWinner: boolean
  isSignificantLoser: boolean
  status: 'control' | 'winner' | 'loser' | 'inconclusive' | 'insufficient_data'
  recommendation: string
}

export const MIN_SAMPLE_SIZE_PER_VARIANT = 25
export const SIGNIFICANCE_THRESHOLD_P_VALUE = 0.05 // 95% confidence
export const BAYESIAN_WINNER_THRESHOLD = 0.95 // 95% chance to beat control

/**
 * Standard normal cumulative distribution function (CDF)
 * Uses Abramowitz and Stegun approximation (formula 7.1.26).
 */
export function normalCdf(z: number): number {
  if (z === 0) return 0.5
  const sign = z < 0 ? -1 : 1
  const absZ = Math.abs(z)

  // Coefficients for erf approximation
  const p = 0.3275911
  const a1 = 0.254829592
  const a2 = -0.284496736
  const a3 = 1.421413741
  const a4 = -1.453152027
  const a5 = 1.061405429

  const t = 1.0 / (1.0 + p * (absZ / Math.SQRT2))
  const erf = 1.0 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-(absZ * absZ) / 2.0)

  return 0.5 * (1.0 + sign * erf)
}

/**
 * Wilson score 95% confidence interval for a binomial proportion.
 * Far superior to normal approximation, especially for low conversion rates or modest sample sizes.
 */
export function wilsonConfidenceInterval(
  conversions: number,
  clicks: number,
  z: number = 1.95996 // 95% confidence standard normal quantile
): [number, number] {
  if (clicks <= 0) return [0, 0]
  const p = conversions / clicks
  const z2 = z * z
  const n = clicks

  const center = (p + z2 / (2 * n)) / (1 + z2 / n)
  const margin = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n)

  const low = Math.max(0, center - margin)
  const high = Math.min(1, center + margin)
  return [Number(low.toFixed(4)), Number(high.toFixed(4))]
}

/**
 * Two-proportion Z-test comparing variant (B) against control (A).
 * Returns { zScore, pValue, relativeUplift, absoluteUplift }.
 */
export function compareTwoProportions(
  control: { clicks: number; conversions: number },
  variant: { clicks: number; conversions: number }
): {
  zScore: number | null
  pValue: number | null
  relativeUplift: number
  absoluteUplift: number
} {
  const pA = control.clicks > 0 ? control.conversions / control.clicks : 0
  const pB = variant.clicks > 0 ? variant.conversions / variant.clicks : 0

  const absoluteUplift = pB - pA
  const relativeUplift = pA > 0 ? (pB - pA) / pA : pB > 0 ? 1 : 0

  if (control.clicks < MIN_SAMPLE_SIZE_PER_VARIANT || variant.clicks < MIN_SAMPLE_SIZE_PER_VARIANT) {
    return { zScore: null, pValue: null, relativeUplift, absoluteUplift }
  }

  const pooledP = (control.conversions + variant.conversions) / (control.clicks + variant.clicks)
  if (pooledP <= 0 || pooledP >= 1) {
    return { zScore: 0, pValue: 1, relativeUplift, absoluteUplift }
  }

  const standardError = Math.sqrt(pooledP * (1 - pooledP) * (1 / control.clicks + 1 / variant.clicks))
  if (standardError <= 0) {
    return { zScore: null, pValue: null, relativeUplift, absoluteUplift }
  }

  const zScore = (pB - pA) / standardError
  // Two-tailed p-value
  const pValue = 2 * (1 - normalCdf(Math.abs(zScore)))

  return {
    zScore: Number(zScore.toFixed(3)),
    pValue: Number(pValue.toFixed(4)),
    relativeUplift: Number(relativeUplift.toFixed(4)),
    absoluteUplift: Number(absoluteUplift.toFixed(4)),
  }
}

/**
 * Computes Bayesian probability that Variant B has a higher conversion rate than Control A,
 * assuming Beta(1,1) uninformative uniform priors.
 *
 * For moderate/large n, uses the normal approximation to the posterior difference:
 * Diff ~ N(mu_B - mu_A, var_A + var_B).
 */
export function bayesianProbabilityToBeatControl(
  control: { clicks: number; conversions: number },
  variant: { clicks: number; conversions: number }
): number {
  if (control.clicks === 0 && variant.clicks === 0) return 0.5
  if (control.clicks === 0) return variant.conversions > 0 ? 0.99 : 0.5
  if (variant.clicks === 0) return 0.01

  // Posterior parameters with Beta(1,1) prior
  const aA = control.conversions + 1
  const bA = control.clicks - control.conversions + 1
  const aB = variant.conversions + 1
  const bB = variant.clicks - variant.conversions + 1

  const muA = aA / (aA + bA)
  const varA = (aA * bA) / ((aA + bA) * (aA + bA) * (aA + bA + 1))

  const muB = aB / (aB + bB)
  const varB = (aB * bB) / ((aB + bB) * (aB + bB) * (aB + bB + 1))

  const diffMu = muB - muA
  const diffSd = Math.sqrt(varA + varB)

  if (diffSd <= 0) return muB >= muA ? 1 : 0

  const z = diffMu / diffSd
  const prob = normalCdf(z)
  return Number(Math.min(0.9999, Math.max(0.0001, prob)).toFixed(4))
}

/**
 * Evaluates all variants in an A/B/n experiment against the baseline/control variant.
 * The control variant is selected as the default destination or the first variant.
 */
export function analyzeExperiment(variants: VariantStats[]): {
  controlId: string | null
  results: StatisticalResult[]
  leadingVariantId: string | null
  hasSignificantWinner: boolean
  summary: string
} {
  if (!variants || variants.length === 0) {
    return {
      controlId: null,
      results: [],
      leadingVariantId: null,
      hasSignificantWinner: false,
      summary: 'No variants configured for this experiment.',
    }
  }

  // Variant with most clicks or first variant acts as baseline/control
  const control = variants[0]
  const controlCI = wilsonConfidenceInterval(control.conversions, control.clicks)

  const controlResult: StatisticalResult = {
    variantId: control.id,
    name: control.name,
    clicks: control.clicks,
    conversions: control.conversions,
    conversionRate: control.clicks > 0 ? control.conversions / control.clicks : 0,
    relativeUplift: 0,
    absoluteUplift: 0,
    zScore: 0,
    pValue: 1,
    confidenceLevel: 0.95,
    confidenceInterval: controlCI,
    bayesianProbabilityToBeatControl: 0.5,
    isSignificantWinner: false,
    isSignificantLoser: false,
    status: 'control',
    recommendation: 'Baseline control variant against which all test variants are compared.',
  }

  if (variants.length === 1) {
    return {
      controlId: control.id,
      results: [controlResult],
      leadingVariantId: control.id,
      hasSignificantWinner: false,
      summary: 'Single routing destination active. Add additional rules with equal priority to begin an A/B experiment.',
    }
  }

  let leadingVariantId: string | null = null
  let hasSignificantWinner = false
  let bestProbability = 0.5

  const results: StatisticalResult[] = [controlResult]

  for (let i = 1; i < variants.length; i++) {
    const variant = variants[i]
    const ci = wilsonConfidenceInterval(variant.conversions, variant.clicks)
    const { zScore, pValue, relativeUplift, absoluteUplift } = compareTwoProportions(control, variant)
    const bayesProb = bayesianProbabilityToBeatControl(control, variant)

    const hasEnoughData = variant.clicks >= MIN_SAMPLE_SIZE_PER_VARIANT && control.clicks >= MIN_SAMPLE_SIZE_PER_VARIANT
    const isSignificantWinner = Boolean(hasEnoughData && pValue !== null && pValue < SIGNIFICANCE_THRESHOLD_P_VALUE && relativeUplift > 0)
    const isSignificantLoser = Boolean(hasEnoughData && pValue !== null && pValue < SIGNIFICANCE_THRESHOLD_P_VALUE && relativeUplift < 0)

    let status: StatisticalResult['status'] = 'inconclusive'
    let recommendation = 'Collecting data. Not enough variance to declare a winner yet.'

    if (!hasEnoughData) {
      status = 'insufficient_data'
      const needed = Math.max(0, MIN_SAMPLE_SIZE_PER_VARIANT - variant.clicks)
      recommendation = `Needs ~${needed} more click${needed === 1 ? '' : 's'} to reach statistical power threshold.`
    } else if (isSignificantWinner) {
      status = 'winner'
      hasSignificantWinner = true
      recommendation = `Statistically significant winner (p = ${pValue}, +${(relativeUplift * 100).toFixed(1)}% uplift). Ready to promote to primary destination.`
    } else if (isSignificantLoser) {
      status = 'loser'
      recommendation = `Underperforming baseline (-${(Math.abs(relativeUplift) * 100).toFixed(1)}% drop, p = ${pValue}). Consider pausing this rule.`
    } else if (bayesProb >= 0.85) {
      recommendation = `${(bayesProb * 100).toFixed(0)}% probability of beating baseline. Gaining momentum.`
    }

    if (bayesProb > bestProbability && variant.clicks >= MIN_SAMPLE_SIZE_PER_VARIANT) {
      bestProbability = bayesProb
      leadingVariantId = variant.id
    }

    results.push({
      variantId: variant.id,
      name: variant.name,
      clicks: variant.clicks,
      conversions: variant.conversions,
      conversionRate: variant.clicks > 0 ? variant.conversions / variant.clicks : 0,
      relativeUplift,
      absoluteUplift,
      zScore,
      pValue,
      confidenceLevel: 0.95,
      confidenceInterval: ci,
      bayesianProbabilityToBeatControl: bayesProb,
      isSignificantWinner,
      isSignificantLoser,
      status,
      recommendation,
    })
  }

  // Generate overall summary
  let summary = ''
  if (hasSignificantWinner) {
    const winner = results.find((r) => r.isSignificantWinner)
    summary = `🎉 Variant "${winner?.name}" is a statistically significant winner with a +${((winner?.relativeUplift || 0) * 100).toFixed(1)}% conversion rate increase (95% confidence).`
  } else if (leadingVariantId) {
    const leader = results.find((r) => r.variantId === leadingVariantId)
    summary = `Variant "${leader?.name}" is currently leading with ${(leader?.conversionRate ? leader.conversionRate * 100 : 0).toFixed(1)}% CVR, but requires more data to confirm statistical significance.`
  } else {
    summary = 'Experiment active. Traffic is being bucketed deterministically across variants.'
  }

  return {
    controlId: control.id,
    results,
    leadingVariantId: hasSignificantWinner ? results.find((r) => r.isSignificantWinner)?.variantId || leadingVariantId : leadingVariantId,
    hasSignificantWinner,
    summary,
  }
}
