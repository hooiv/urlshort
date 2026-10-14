import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/email', () => ({ sendEmail: async () => true }))
import { renderBrokenAlerts } from './broken-link-alerts'

const link = (c: string, code: number | null = 404) => ({ shortCode: c, originalUrl: `https://x.test/${c}`, statusCode: code, failures: 4, clicks: 9 })

describe('broken link alerts', () => {
  it('renders singular subject, status code and unreachable', () => {
    const r = renderBrokenAlerts({ email: 'a@b.c', name: 'Ann', total: 1, links: [link('a', null)] }, 'https://q.l')
    expect(r.subject).toBe('1 short link points to a broken destination')
    expect(r.text).toContain('Hi Ann')
    expect(r.text).toContain('unreachable')
    expect(r.text).toContain('https://q.l/manage/broken')
  })
  it('mentions the overflow beyond listed links', () => {
    const r = renderBrokenAlerts({ email: 'a@b.c', name: null, total: 25, links: [link('a'), link('b')] }, 'https://q.l')
    expect(r.subject).toBe('25 short links point to a broken destination')
    expect(r.text).toContain('...and 23 more.')
    expect(r.text).toContain('HTTP 404')
  })
})
