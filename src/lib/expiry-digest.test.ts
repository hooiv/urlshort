import { describe, expect, it } from 'vitest'
import { renderDigest, thresholdFor, windowFor } from './expiry-digest'

const now = new Date('2026-10-13T09:00:00Z')
const h = (n: number) => new Date(now.getTime() + n * 3_600_000)

describe('expiry digest', () => {
  it('assigns each expiry to at most one daily window', () => {
    expect(thresholdFor(h(12), now)).toBe(1)
    expect(thresholdFor(h(24), now)).toBe(1)
    expect(thresholdFor(h(25), now)).toBeNull()
    expect(thresholdFor(h(6 * 24 + 1), now)).toBe(7)
    expect(thresholdFor(h(7 * 24), now)).toBe(7)
    expect(thresholdFor(h(7 * 24 + 1), now)).toBeNull()
    expect(thresholdFor(h(-1), now)).toBeNull()
  })
  it('consecutive daily runs never repeat a link', () => {
    const e = h(7 * 24 - 5)
    const next = new Date(now.getTime() + 86_400_000)
    expect(thresholdFor(e, now)).toBe(7)
    expect(thresholdFor(e, next)).toBeNull()
    expect(windowFor(next, 7).gt.getTime()).toBe(windowFor(now, 7).lte.getTime())
  })
  it('renders sorted digest with singular/plural subject', () => {
    const one = renderDigest({ email: 'a@b.c', name: 'Ann', links: [{ shortCode: 'x', originalUrl: 'https://e.com', expiresAt: h(5), thresholdDays: 1 }] }, 'https://q.l')
    expect(one.subject).toBe('1 short link expiring soon')
    expect(one.text).toContain('https://q.l/x expires')
    expect(one.text).toContain('Hi Ann')
    expect(one.text).toContain('https://q.l/manage/expiring')
    const two = renderDigest({ email: 'a@b.c', name: null, links: [
      { shortCode: 'late', originalUrl: 'u', expiresAt: h(100), thresholdDays: 7 },
      { shortCode: 'soon', originalUrl: 'u', expiresAt: h(3), thresholdDays: 1 }] }, 'https://q.l')
    expect(two.subject).toBe('2 short links expiring soon')
    expect(two.text.indexOf('/soon')).toBeLessThan(two.text.indexOf('/late'))
  })
})
