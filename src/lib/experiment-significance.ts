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
