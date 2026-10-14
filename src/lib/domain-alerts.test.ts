import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/email', () => ({ sendEmail: async () => true }))
import { expiryThreshold, expiryWindow, renderDomainAlerts } from './domain-alerts'

const now = new Date('2026-10-14T01:00:00Z')
const h = (n: number) => new Date(now.getTime() + n * 3_600_000)

describe('domain alerts', () => {
  it('maps expiry to one threshold window', () => {
    expect(expiryThreshold(h(12), now)).toBe(1)
    expect(expiryThreshold(h(60), now)).toBe(3)
    expect(expiryThreshold(h(13 * 24 + 1), now)).toBe(14)
    expect(expiryThreshold(h(14 * 24 + 1), now)).toBeNull()
    expect(expiryThreshold(h(-1), now)).toBeNull()
  })
  it('consecutive daily runs never repeat an expiry', () => {
    const e = h(14 * 24 - 2)
    const next = new Date(now.getTime() + 86_400_000)
    expect(expiryThreshold(e, now)).toBe(14)
    expect(expiryThreshold(e, next)).toBeNull()
    expect(expiryWindow(next, 14).gt.getTime()).toBe(expiryWindow(now, 15).gt.getTime())
  })
  it('renders failed domains first with plural subject', () => {
    const r = renderDomainAlerts({ email: 'a@b.c', name: 'Ann', alerts: [
      { host: 'b.example', reason: { kind: 'expiring', thresholdDays: 3, expiresAt: h(60) } },
      { host: 'a.example', reason: { kind: 'failed' } },
    ] }, 'https://q.l')
    expect(r.subject).toBe('2 custom domains need attention')
    expect(r.text.indexOf('a.example')).toBeLessThan(r.text.indexOf('b.example'))
    expect(r.text).toContain('within 3 days')
    expect(r.text).toContain('https://q.l/manage')
    expect(renderDomainAlerts({ email: 'a@b.c', name: null, alerts: [{ host: 'x.y', reason: { kind: 'failed' } }] }, 'https://q.l').subject).toBe('1 custom domain needs attention')
  })
})
