/**
 * Pure reliability math for the per-link health console.
 *
 * Kept separate from React so stats, bar geometry, and API payload parsing
 * are unit-testable in the node vitest environment.
 */
import type { ProbeCheck, ProbeStats, Status } from './types'

export function labelStatus(status: Status): string {
  switch (status) {
    case 'healthy':
      return 'All Systems Operational'
    case 'degraded':
      return 'Performance Degraded'
    case 'down':
      return 'Destination Endpoint Down'
    default:
      return 'Health Status Unknown'
  }
}

/** Aggregate recent probe checks into headline stats. Null when there is no history. */
export function computeProbeStats(checks: ProbeCheck[]): ProbeStats | null {
  if (!checks.length) return null
  let sum = 0
  let count = 0
  let max = 0
  for (const check of checks) {
    const latency = check.latencyMs
    if (latency != null && latency > 0) {
      sum += latency
      count += 1
      if (latency > max) max = latency
    }
  }
  let successes = 0
  let failures = 0
  let degraded = 0
  for (const check of checks) {
    if (check.status === 'healthy') successes += 1
    else if (check.status === 'down') failures += 1
    else if (check.status === 'degraded') degraded += 1
  }
  return {
    avgLatency: count ? Math.round(sum / count) : 0,
    maxLatency: count ? max : 100,
    successes,
    failures,
    degraded,
  }
}

/** Bar height for the latency timeline, clamped so tiny/fast probes stay visible. */
export function barHeightPercent(latencyMs: number | null, maxLatency: number): number {
  const latency = latencyMs || 20
  const ceiling = Math.max(maxLatency, 100)
  return Math.min(Math.max((latency / ceiling) * 100, 10), 100)
}

/** A probe counts as an error when it is down or returned an HTTP error code. */
export function isErrorProbe(check: Pick<ProbeCheck, 'status' | 'statusCode'>): boolean {
  return check.status === 'down' || (check.statusCode != null && check.statusCode >= 400)
}

export interface ProbeResult {
  status: Status
  statusCode: number | null
  latencyMs: number | null
}

function asStatus(value: unknown): Status {
  return value === 'healthy' || value === 'degraded' || value === 'down' || value === 'unknown'
    ? value
    : 'unknown'
}

/**
 * Read a probe result out of a POST /health response payload.
 *
 * The API returns `{ target, status, result: { status, statusCode, latencyMs } }`,
 * so top-level `statusCode`/`latencyMs` lookups always resolve to undefined.
 * This helper prefers the nested `result` object while staying compatible with
 * a flat legacy shape.
 */
export function readProbeResult(payload: unknown): ProbeResult {
  const root = (payload ?? {}) as Record<string, unknown>
  const nested = root.result
  const source =
    nested !== null && typeof nested === 'object' ? (nested as Record<string, unknown>) : root
  return {
    status: asStatus(source.status ?? root.status),
    statusCode: typeof source.statusCode === 'number' ? source.statusCode : null,
    latencyMs: typeof source.latencyMs === 'number' ? source.latencyMs : null,
  }
}

/** sessionStorage access that never throws (private mode, SSR, or blocked storage). */
export function readManageToken(shortCode: string): string | null {
  try {
    if (typeof window === 'undefined') return null
    return sessionStorage.getItem(`ql-token:${shortCode}`)
  } catch {
    return null
  }
}
