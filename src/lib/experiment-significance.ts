/**
 * Statistical read-out for destination experiments (link rules acting as variants).
 * Uses a pooled two-proportion z-test of each variant against the control
 * (the variant with the most clicks, unless one is named), two-sided, with a
 * minimum-sample guard so a handful of clicks never declares a winner.
 */
export const MIN_CLICKS_PER_VARIANT = 100
export const MIN_CONVERSIONS_TOTAL = 10
export const DEFAULT_CONFIDENCE = 0.95

export interface VariantCounts {
  id: string
  name: string
  clicks: number
  /** Distinct converting visitors/clicks; must never exceed clicks. */
  conversions: number
}

export interface VariantResult extends VariantCounts {
  rate: number
  isControl: boolean
  /** Relative lift vs control as a fraction (0.12 = +12%); null for control or a zero-rate control. */
  lift: number | null
  /** Two-sided p-value vs control; null for control or when the test is not computable. */
  pValue: number | null
  /** 1 - pValue, as a fraction; null when pValue is null. */
  confidence: number | null
  significant: boolean
  /** Wilson 95% interval of the conversion rate. */
  ci: [number, number]
}

export interface ExperimentReport {
  control: string | null
  variants: VariantResult[]
  status: 'insufficient_data' | 'no_significant_difference' | 'winner'
  winnerId: string | null
  /** Human-readable reason, e.g. what is missing for a verdict. */
  note: string
}

/** Standard normal CDF (Abramowitz-Stegun 7.1.26 via erf), accurate to ~1e-7. */
export function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2
  const t = 1 / (1 + 0.3275911 * x)
  const poly = ((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592
  const erf = 1 - poly * t * Math.exp(-x * x)
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf)
}

export function twoProportionPValue(c1: number, n1: number, c2: number, n2: number): number | null {
  if (n1 <= 0 || n2 <= 0) return null
  const pooled = (c1 + c2) / (n1 + n2)
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2))
  if (se === 0) return null
  const z = (c2 / n2 - c1 / n1) / se
  return Math.min(1, 2 * (1 - normalCdf(Math.abs(z))))
}

export function wilsonInterval(conversions: number, clicks: number, z = 1.96): [number, number] {
  if (clicks <= 0) return [0, 0]
  const p = conversions / clicks
  const z2 = z * z
  const denom = 1 + z2 / clicks
  const centre = (p + z2 / (2 * clicks)) / denom
  const half = (z * Math.sqrt((p * (1 - p)) / clicks + z2 / (4 * clicks * clicks))) / denom
  return [Math.max(0, centre - half), Math.min(1, centre + half)]
}

export function analyzeExperiment(input: VariantCounts[], opts: { controlId?: string; confidence?: number } = {}): ExperimentReport {
  const confidence = opts.confidence ?? DEFAULT_CONFIDENCE
  if (!(confidence > 0 && confidence < 1)) throw new RangeError('confidence must be between 0 and 1')
  const rows = input.map((v) => ({ ...v, clicks: Math.max(0, Math.floor(v.clicks)), conversions: Math.max(0, Math.min(Math.floor(v.conversions), Math.max(0, Math.floor(v.clicks)))) }))
  if (rows.length < 2) {
    return { control: rows[0]?.id ?? null, variants: rows.map((r) => ({ ...r, rate: r.clicks ? r.conversions / r.clicks : 0, isControl: true, lift: null, pValue: null, confidence: null, significant: false, ci: wilsonInterval(r.conversions, r.clicks) })), status: 'insufficient_data', winnerId: null, note: 'An experiment needs at least two variants.' }
  }
  const control = (opts.controlId && rows.find((r) => r.id === opts.controlId)) || [...rows].sort((a, b) => b.clicks - a.clicks)[0]
  const controlRate = control.clicks ? control.conversions / control.clicks : 0
  const variants: VariantResult[] = rows.map((r) => {
    const rate = r.clicks ? r.conversions / r.clicks : 0
    const isControl = r.id === control.id
    const p = isControl ? null : twoProportionPValue(control.conversions, control.clicks, r.conversions, r.clicks)
    const enough = r.clicks >= MIN_CLICKS_PER_VARIANT && control.clicks >= MIN_CLICKS_PER_VARIANT
    return {
      ...r, rate, isControl,
      lift: isControl || controlRate === 0 ? null : (rate - controlRate) / controlRate,
      pValue: p, confidence: p === null ? null : 1 - p,
      significant: !isControl && enough && p !== null && 1 - p >= confidence,
      ci: wilsonInterval(r.conversions, r.clicks),
    }
  })
  const totalConv = rows.reduce((s, r) => s + r.conversions, 0)
  const short = rows.filter((r) => r.clicks < MIN_CLICKS_PER_VARIANT)
  if (short.length || totalConv < MIN_CONVERSIONS_TOTAL) {
    const note = short.length
      ? `Collect at least ${MIN_CLICKS_PER_VARIANT} clicks per variant (${short.map((s) => s.name).join(', ')} below).`
      : `Need at least ${MIN_CONVERSIONS_TOTAL} conversions in total; ${totalConv} so far.`
    return { control: control.id, variants, status: 'insufficient_data', winnerId: null, note }
  }
  const sig = variants.filter((v) => v.significant)
  const bestSig = sig.filter((v) => v.rate > controlRate).sort((a, b) => b.rate - a.rate)[0]
  const controlBeatsAll = sig.length === variants.length - 1 && sig.every((v) => v.rate < controlRate)
  if (bestSig) {
    // The winner must also not be beaten significantly by another variant.
    const beaten = variants.some((o) => o.id !== bestSig.id && o.rate > bestSig.rate && (twoProportionPValue(bestSig.conversions, bestSig.clicks, o.conversions, o.clicks) ?? 1) <= 1 - confidence)
    if (!beaten) return { control: control.id, variants, status: 'winner', winnerId: bestSig.id, note: `"${bestSig.name}" beats the control at ${(bestSig.confidence! * 100).toFixed(1)}% confidence.` }
  }
  if (controlBeatsAll) return { control: control.id, variants, status: 'winner', winnerId: control.id, note: `The control "${control.name}" outperforms every variant.` }
  return { control: control.id, variants, status: 'no_significant_difference', winnerId: null, note: 'No variant differs from the control at the requested confidence yet; keep the test running.' }
}

/** Inverse standard normal CDF (Acklam's rational approximation, rel. error < 1.2e-9). */
export function normalInv(p: number): number {
  if (!(p > 0 && p < 1)) throw new RangeError('p must be in (0, 1)')
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239]
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1]
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416]
  const lo = 0.02425
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p))
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  if (p > 1 - lo) return -normalInv(1 - p)
  const q = p - 0.5
  const r = q * q
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
}

export interface SampleSizePlan {
  baselineRate: number
  relativeLift: number
  confidence: number
  power: number
  clicksPerVariant: number
}

/**
 * Clicks needed per variant to detect a relative lift over a baseline conversion
 * rate with a two-sided two-proportion z-test. Returns null when the inputs
 * cannot produce a valid test (rate outside (0,1), lift <= 0, or the lifted rate >= 1).
 */
export function requiredClicksPerVariant(baselineRate: number, relativeLift: number, opts: { confidence?: number; power?: number } = {}): SampleSizePlan | null {
  const confidence = opts.confidence ?? DEFAULT_CONFIDENCE
  const power = opts.power ?? 0.8
  if (!(baselineRate > 0 && baselineRate < 1) || !(relativeLift > 0)) return null
  if (!(confidence > 0.5 && confidence < 1) || !(power > 0.5 && power < 1)) return null
  const p1 = baselineRate
  const p2 = baselineRate * (1 + relativeLift)
  if (p2 >= 1) return null
  const zA = normalInv(1 - (1 - confidence) / 2)
  const zB = normalInv(power)
  const pBar = (p1 + p2) / 2
  const num = zA * Math.sqrt(2 * pBar * (1 - pBar)) + zB * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))
  const n = Math.ceil((num * num) / ((p2 - p1) ** 2))
  return { baselineRate, relativeLift, confidence, power, clicksPerVariant: Math.max(n, MIN_CLICKS_PER_VARIANT) }
}

/** Days until every variant reaches the plan's sample size at current daily click rates; null if any variant has no traffic. */
export function daysToSampleSize(plan: SampleSizePlan, variants: { clicks: number }[], windowDays: number): number | null {
  if (!variants.length || windowDays <= 0) return null
  let worst = 0
  for (const v of variants) {
    const perDay = v.clicks / windowDays
    if (perDay <= 0) return null
    worst = Math.max(worst, Math.ceil(Math.max(0, plan.clicksPerVariant - v.clicks) / perDay))
  }
  return worst
}
