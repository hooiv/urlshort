/**
 * Stopping-rule recommendation for destination experiments. Combines the
 * frequentist report, the Bayesian read-out and the sample-size plan into one
 * actionable verdict so owners are not tempted to "peek" and stop early.
 */
import type { ExperimentReport, SampleSizePlan } from './experiment-significance'
import type { BayesianVariant } from './experiment-bayesian'

export type DecisionAction = 'keep_running' | 'ship_variant' | 'keep_control' | 'stop_no_effect'

export interface ExperimentDecision {
  action: DecisionAction
  variantId: string | null
  reason: string
}

export interface DecisionOptions {
  /** Bayesian probability a variant must reach to ship under the Bayesian rule. */
  probabilityThreshold?: number
  /** Max tolerable expected absolute conversion-rate loss (default 0.1 percentage points). */
  lossThreshold?: number
}

export function decideExperiment(
  report: ExperimentReport,
  bayesian: BayesianVariant[],
  plan: SampleSizePlan | null,
  opts: DecisionOptions = {},
): ExperimentDecision {
  const probT = opts.probabilityThreshold ?? 0.95
  const lossT = opts.lossThreshold ?? 0.001
  if (report.variants.length < 2 || report.status === 'insufficient_data') {
    return { action: 'keep_running', variantId: null, reason: report.note }
  }
  const reached = plan ? report.variants.every((v) => v.clicks >= plan.clicksPerVariant) : false
  // Frequentist winner is only trusted once the planned sample is collected, to avoid peeking bias.
  if (report.status === 'winner' && reached) {
    return report.winnerId === report.control
      ? { action: 'keep_control', variantId: report.control, reason: report.note }
      : { action: 'ship_variant', variantId: report.winnerId, reason: `${report.note} Planned sample reached.` }
  }
  // Bayesian early stop: needs half the planned sample, high probability AND negligible expected loss.
  const best = bayesian
    .filter((b) => b.probBeatControl !== null)
    .sort((a, b) => (b.probBeatControl! - a.probBeatControl!))[0]
  const halfway = plan ? report.variants.every((v) => v.clicks >= plan.clicksPerVariant / 2) : false
  if (halfway && best && best.probBeatControl! >= probT && best.expectedLoss <= lossT) {
    return {
      action: 'ship_variant',
      variantId: best.id,
      reason: `${(best.probBeatControl! * 100).toFixed(1)}% probability to beat control with expected loss ${(best.expectedLoss * 100).toFixed(3)} pp.`,
    }
  }
  if (reached && report.status === 'no_significant_difference') {
    return { action: 'stop_no_effect', variantId: null, reason: 'Planned sample reached with no detectable difference; pick the cheaper or simpler variant.' }
  }
  if (report.status === 'winner') {
    return { action: 'keep_running', variantId: null, reason: `${report.note} Keep running until the planned sample is reached to avoid early-stopping bias.` }
  }
  return { action: 'keep_running', variantId: null, reason: plan ? `Planned sample of ${plan.clicksPerVariant} clicks per variant not reached yet.` : 'Not enough data yet.' }
}
