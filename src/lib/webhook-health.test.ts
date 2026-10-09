import { describe, expect, it } from 'vitest'
import { shouldDisableEndpoint, disableNotice, WEBHOOK_DISABLE_MIN_FAILURES } from './webhook-health'

const now = new Date('2026-10-11T12:00:00Z')
const h = (n: number) => new Date(now.getTime() - n * 3600_000)
const fails = (n: number, spanH: number) => Array.from({ length: n }, (_, i) => ({ status: 'failed' as const, createdAt: h((spanH * i) / Math.max(n - 1, 1)) }))

describe('shouldDisableEndpoint', () => {
  it('disables after enough consecutive failures over 24h+', () => {
    expect(shouldDisableEndpoint(fails(WEBHOOK_DISABLE_MIN_FAILURES, 30), now)).toBe(true)
  })
  it('tolerates a short outage', () => {
    expect(shouldDisableEndpoint(fails(20, 2), now)).toBe(false)
  })
  it('needs enough failures', () => {
    expect(shouldDisableEndpoint(fails(3, 72), now)).toBe(false)
  })
  it('a recent success resets the streak', () => {
    const rows = [{ status: 'success' as const, createdAt: h(0) }, ...fails(12, 48)]
    expect(shouldDisableEndpoint(rows, now)).toBe(false)
  })
  it('names the host in the notice', () => {
    expect(disableNotice('https://hooks.example.com/x', 'r').subject).toContain('hooks.example.com')
  })
})
