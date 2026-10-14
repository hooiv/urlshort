import { describe, expect, it } from 'vitest'
import { crossedThreshold, renderUsageAlert } from './usage-alerts'

describe('crossedThreshold', () => {
  it('returns null below 80%', () => expect(crossedThreshold(79n, 100n)).toBeNull())
  it('returns 80 from 80% up to the limit', () => { expect(crossedThreshold(80n, 100n)).toBe(80); expect(crossedThreshold(99n, 100n)).toBe(80) })
  it('returns 100 at and over the limit', () => { expect(crossedThreshold(100n, 100n)).toBe(100); expect(crossedThreshold(250n, 100n)).toBe(100) })
  it('ignores zero limits and negative usage', () => { expect(crossedThreshold(5n, 0n)).toBeNull(); expect(crossedThreshold(-1n, 10n)).toBeNull() })
  it('handles values beyond 2^53', () => expect(crossedThreshold(9_000_000_000_000_000_000n, 10_000_000_000_000_000_000n)).toBe(80))
})

describe('renderUsageAlert', () => {
  it('flags reached limits in subject and body', () => {
    const r = renderUsageAlert('Acme', '2026-10', [{ metric: 'clicks', label: 'clicks', threshold: 100, used: 100000n, limit: 100000n }], 'https://x.io')
    expect(r.subject).toBe('Acme reached a monthly limit')
    expect(r.text).toContain('100,000 of 100,000 (100%) limit reached')
  })
  it('uses the warning subject at 80%', () => {
    const r = renderUsageAlert('Acme', '2026-10', [{ metric: 'api_requests', label: 'API requests', threshold: 80, used: 8500n, limit: 10000n }], 'https://x.io')
    expect(r.subject).toBe('Acme is at 80% of a monthly limit')
    expect(r.text).toContain('(85%)')
  })
})
