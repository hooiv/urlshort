/**
 * Click-cap runway: projects when a click-capped link will run out from its
 * recent daily rate, so a fast-burning cap is flagged days before it reaches
 * the 80% warning ratio.
 */
export const RUNWAY_WINDOW_DAYS = 7

export type CapRunway = {
  clicksPerDay: number
  /** Whole days until the cap is hit at the recent rate; null when the rate is zero. */
  daysRemaining: number | null
  projectedExhaustionAt: string | null
}

/**
 * Rate = clicks in the trailing window / window length. `recentClicks` is the
 * sum of daily counts for the window; `remaining` is maxClicks - clicks.
 */
export function projectCapRunway(remaining: number, recentClicks: number, now: Date, windowDays = RUNWAY_WINDOW_DAYS): CapRunway {
  const clicksPerDay = windowDays > 0 ? recentClicks / windowDays : 0
  if (remaining <= 0) return { clicksPerDay, daysRemaining: 0, projectedExhaustionAt: now.toISOString() }
  if (clicksPerDay <= 0) return { clicksPerDay: 0, daysRemaining: null, projectedExhaustionAt: null }
  const days = remaining / clicksPerDay
  return {
    clicksPerDay: Math.round(clicksPerDay * 100) / 100,
    daysRemaining: Math.ceil(days),
    projectedExhaustionAt: new Date(now.getTime() + days * 86_400_000).toISOString(),
  }
}

/** UTC date keys (YYYY-MM-DD) for the trailing window, oldest first, including today. */
export function runwayDateKeys(now: Date, windowDays = RUNWAY_WINDOW_DAYS): string[] {
  const keys: string[] = []
  for (let i = windowDays - 1; i >= 0; i--) keys.push(new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10))
  return keys
}
