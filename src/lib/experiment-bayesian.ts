/**
 * Bayesian read-out for destination experiments: probability that each variant
 * beats the control, and expected loss of shipping it. Uses Beta(1,1) priors
 * and a deterministic seeded Monte Carlo so results are reproducible.
 */
import type { VariantCounts } from './experiment-significance'

export interface BayesianVariant {
  id: string
  probBeatControl: number | null
  /** Expected absolute conversion-rate loss if this variant is chosen. */
  expectedLoss: number
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gaussian(rand: () => number): number {
  const u = Math.max(rand(), 1e-12)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand())
}

/** Marsaglia-Tsang gamma sampler (shape >= 1 is all we need: alpha,beta >= 1). */
function gamma(shape: number, rand: () => number): number {
  const d = shape - 1 / 3
  const c = 1 / Math.sqrt(9 * d)
  for (;;) {
    let x: number, v: number
    do {
      x = gaussian(rand)
      v = 1 + c * x
    } while (v <= 0)
    v = v * v * v
    const u = rand()
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v
  }
}

function beta(a: number, b: number, rand: () => number): number {
  const x = gamma(a, rand)
  return x / (x + gamma(b, rand))
}

export function bayesianReport(
  variants: VariantCounts[],
  controlId: string,
  samples = 20000,
  seed = 1337,
): BayesianVariant[] {
  const control = variants.find((v) => v.id === controlId)
  if (!control || samples < 1) return []
  const rand = mulberry32(seed)
  const clamp = (v: VariantCounts) => ({
    a: 1 + Math.min(Math.max(v.conversions, 0), Math.max(v.clicks, 0)),
    b: 1 + Math.max(v.clicks, 0) - Math.min(Math.max(v.conversions, 0), Math.max(v.clicks, 0)),
  })
  const cp = clamp(control)
  return variants.map((v) => {
    if (v.id === controlId) return { id: v.id, probBeatControl: null, expectedLoss: 0 }
    const p = clamp(v)
    let wins = 0
    let loss = 0
    for (let i = 0; i < samples; i++) {
      const pc = beta(cp.a, cp.b, rand)
      const pv = beta(p.a, p.b, rand)
      if (pv > pc) wins++
      else loss += pc - pv
    }
    return { id: v.id, probBeatControl: wins / samples, expectedLoss: loss / samples }
  })
}
