import { describe, expect, it } from 'vitest'
import {
  barHeightPercent,
  computeProbeStats,
  isErrorProbe,
  labelStatus,
  readManageToken,
  readProbeResult,
} from './healthStats'
import type { ProbeCheck } from './types'

function probe(overrides: Partial<ProbeCheck> = {}): ProbeCheck {
  return {
    id: 'probe-1',
    targetUrl: 'https://example.com',
    status: 'healthy',
    statusCode: 200,
    latencyMs: 120,
    error: null,
    checkedAt: '2026-09-01T00:00:00.000Z',
    ruleId: null,
    revisionId: null,
    ...overrides,
  }
}

describe('labelStatus', () => {
  it('covers every health state', () => {
    expect(labelStatus('healthy')).toBe('All Systems Operational')
    expect(labelStatus('degraded')).toBe('Performance Degraded')
    expect(labelStatus('down')).toBe('Destination Endpoint Down')
    expect(labelStatus('unknown')).toBe('Health Status Unknown')
  })
})

describe('computeProbeStats', () => {
  it('returns null without probe history', () => {
    expect(computeProbeStats([])).toBeNull()
  })

  it('averages only positive latencies and counts each status', () => {
    const stats = computeProbeStats([
      probe({ id: 'a', latencyMs: 100, status: 'healthy' }),
      probe({ id: 'b', latencyMs: 300, status: 'down', statusCode: 500 }),
      probe({ id: 'c', latencyMs: null, status: 'degraded', statusCode: null }),
      probe({ id: 'd', latencyMs: -5, status: 'unknown', statusCode: null }),
    ])
    expect(stats).toEqual({ avgLatency: 200, maxLatency: 300, successes: 1, failures: 1, degraded: 1 })
  })

  it('falls back to zero average and a 100ms ceiling without valid latencies', () => {
    expect(computeProbeStats([probe({ latencyMs: null })])).toMatchObject({
      avgLatency: 0,
      maxLatency: 100,
    })
  })
})

describe('barHeightPercent', () => {
  it('scales against the ceiling and clamps to 10-100%', () => {
    expect(barHeightPercent(50, 200)).toBe(25)
    expect(barHeightPercent(1, 10_000)).toBe(10)
    expect(barHeightPercent(9_999, 100)).toBe(100)
  })

  it('treats missing latency as a small placeholder bar', () => {
    expect(barHeightPercent(null, 200)).toBe(10)
  })
})

describe('isErrorProbe', () => {
  it('flags down probes and HTTP error codes only', () => {
    expect(isErrorProbe({ status: 'down', statusCode: null })).toBe(true)
    expect(isErrorProbe({ status: 'healthy', statusCode: 500 })).toBe(true)
    expect(isErrorProbe({ status: 'healthy', statusCode: 200 })).toBe(false)
    expect(isErrorProbe({ status: 'degraded', statusCode: null })).toBe(false)
  })
})

describe('readProbeResult', () => {
  it('reads the nested result object returned by POST /health', () => {
    expect(
      readProbeResult({ target: 'fallback', status: 'healthy', result: { status: 'healthy', statusCode: 200, latencyMs: 142 } })
    ).toEqual({ status: 'healthy', statusCode: 200, latencyMs: 142 })
  })

  it('still supports a flat legacy payload', () => {
    expect(readProbeResult({ status: 'down', statusCode: 503, latencyMs: 40 })).toEqual({
      status: 'down',
      statusCode: 503,
      latencyMs: 40,
    })
  })

  it('defaults safely on missing or malformed payloads', () => {
    expect(readProbeResult(null)).toEqual({ status: 'unknown', statusCode: null, latencyMs: null })
    expect(readProbeResult({ status: 'bogus', statusCode: 'fast' })).toEqual({
      status: 'unknown',
      statusCode: null,
      latencyMs: null,
    })
  })
})

describe('readManageToken', () => {
  it('returns null outside the browser instead of throwing', () => {
    expect(readManageToken('abc123')).toBeNull()
  })
})
