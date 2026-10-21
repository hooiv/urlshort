import { MIN_CLICKS_PER_VARIANT } from './experiment-significance'

/** Inverse standard normal CDF (Acklam's rational approximation, rel. error < 1.2e-9). */
export function normalQuantile(p: number): number {
  if (!(p > 0 && p < 1)) throw new RangeError('p must be in (0,1)')
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239]
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1]
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416]
  const lo = 0.02425
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p))
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  if (p > 1 - lo) return -normalQuantile(1 - p)
  const q = p - 0.5
  const r = q * q
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
}

export interface SampleSizeInput {
  /** Control conversion rate as a fraction, 0 < x < 1. */
  baselineRate: number
  /** Smallest relative lift worth detecting (0.1 = +10%). */
  minRelativeLift: number
  confidence?: number
  power?: number
  variants?: number
  /** Expected total clicks per day across all variants, for the duration estimate. */
  dailyClicks?: number
}

export interface SampleSizePlan {
  perVariantClicks: number
  totalClicks: number
  targetRate: number
  estimatedDays: number | null
}

export function parseSampleSizeInput(params: URLSearchParams): SampleSizeInput | { error: string } {
  const num = (k: string) => (params.get(k) === null || params.get(k) === '' ? undefined : Number(params.get(k)))
  const baselineRate = num('baselineRate')
  const minRelativeLift = num('minRelativeLift')
  if (baselineRate === undefined || !(baselineRate > 0 && baselineRate < 1)) return { error: 'baselineRate must be between 0 and 1 (exclusive)' }
  if (minRelativeLift === undefined || !(minRelativeLift > 0 && minRelativeLift <= 10)) return { error: 'minRelativeLift must be > 0 and <= 10' }
  const confidence = num('confidence') ?? 0.95
  if (!(confidence >= 0.8 && confidence <= 0.999)) return { error: 'confidence must be between 0.8 and 0.999' }
  const power = num('power') ?? 0.8
  if (!(power >= 0.5 && power <= 0.99)) return { error: 'power must be between 0.5 and 0.99' }
  const variants = num('variants') ?? 2
  if (!Number.isInteger(variants) || variants < 2 || variants > 10) return { error: 'variants must be an integer from 2 to 10' }
  const dailyClicks = num('dailyClicks')
  if (dailyClicks !== undefined && !(dailyClicks > 0 && Number.isFinite(dailyClicks))) return { error: 'dailyClicks must be a positive number' }
  if (baselineRate * (1 + minRelativeLift) >= 1) return { error: 'baselineRate * (1 + minRelativeLift) must stay below 1' }
  return { baselineRate, minRelativeLift, confidence, power, variants, dailyClicks }
}

/**
 * Per-variant sample for a two-sided two-proportion test (unpooled-variance formula),
 * with a Bonferroni-corrected alpha when more than two variants compete with the control.
 * Never below the minimum the significance report itself requires.
 */
export function planSampleSize(input: SampleSizeInput): SampleSizePlan {
  const confidence = input.confidence ?? 0.95
  const power = input.power ?? 0.8
  const variants = input.variants ?? 2
  const p1 = input.baselineRate
  const p2 = p1 * (1 + input.minRelativeLift)
  const alpha = (1 - confidence) / Math.max(1, variants - 1)
  const zA = normalQuantile(1 - alpha / 2)
  const zB = normalQuantile(power)
  const pBar = (p1 + p2) / 2
  const n = Math.pow(zA * Math.sqrt(2 * pBar * (1 - pBar)) + zB * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2)), 2) / Math.pow(p2 - p1, 2)
  const perVariantClicks = Math.max(MIN_CLICKS_PER_VARIANT, Math.ceil(n))
  const totalClicks = perVariantClicks * variants
  return {
    perVariantClicks,
    totalClicks,
    targetRate: p2,
    estimatedDays: input.dailyClicks ? Math.ceil(totalClicks / input.dailyClicks) : null,
  }
}
