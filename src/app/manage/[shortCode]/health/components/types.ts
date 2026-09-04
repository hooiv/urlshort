export type Status = 'unknown' | 'healthy' | 'degraded' | 'down'

export interface RuleHealth {
  id: string
  name: string
  destinationUrl: string
  enabled: boolean
  healthStatus: Status
  healthCheckedAt: string | null
  healthLatencyMs: number | null
  healthStatusCode: number | null
  healthLastError: string | null
  consecutiveFailures: number
  consecutiveSuccesses: number
}

export interface ProbeCheck {
  id: string
  targetUrl: string
  status: Status
  statusCode: number | null
  latencyMs: number | null
  error: string | null
  checkedAt: string
  ruleId: string | null
  revisionId: string | null
}

export interface HealthData {
  url: {
    healthStatus: Status
    healthCheckedAt: string | null
    healthLatencyMs: number | null
    healthStatusCode: number | null
    healthLastError: string | null
    healthConsecutiveFailures: number
    healthConsecutiveSuccesses: number
    autoFailoverEnabled: boolean
    lastHealthyRevisionId: string | null
  }
  rules: RuleHealth[]
  checks: ProbeCheck[]
}

export interface ProbeStats {
  avgLatency: number
  maxLatency: number
  successes: number
  failures: number
  degraded: number
}
