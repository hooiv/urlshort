import { describe, expect, it } from 'vitest'
import { rateLimit, rateLimitHeaders, withRateLimitHeaders } from '@/lib/rate-limit'

describe('rateLimitHeaders', () => {
  it('reports remaining and reset on allowed requests without Retry-After', async () => {
    const req = new Request('http://x', { headers: { 'x-forwarded-for': '10.9.0.1' } })
    const r = await rateLimit(req, { name: 'hdr-a', limit: 3, windowMs: 60_000 })
    const h = rateLimitHeaders(r)
    expect(h['RateLimit-Limit']).toBe('3')
    expect(h['X-RateLimit-Remaining']).toBe('2')
    expect(Number(h['RateLimit-Reset'])).toBeGreaterThan(0)
    expect(h['Retry-After']).toBeUndefined()
  })

  it('adds Retry-After and zero remaining once the window is exhausted', async () => {
    const req = new Request('http://x', { headers: { 'x-forwarded-for': '10.9.0.2' } })
    let r = await rateLimit(req, { name: 'hdr-b', limit: 1, windowMs: 60_000 })
    r = await rateLimit(req, { name: 'hdr-b', limit: 1, windowMs: 60_000 })
    const h = rateLimitHeaders(r)
    expect(r.allowed).toBe(false)
    expect(h['RateLimit-Remaining']).toBe('0')
    expect(Number(h['Retry-After'])).toBeGreaterThanOrEqual(1)
    expect(h['RateLimit-Reset']).toBe(h['Retry-After'])
  })

  it('copies headers onto a response', () => {
    const res = withRateLimitHeaders(new Response('x'), { allowed: true, remaining: 5, retryAfterSeconds: 0, limit: 10, resetSeconds: 30 })
    expect(res.headers.get('X-RateLimit-Limit')).toBe('10')
    expect(res.headers.get('RateLimit-Reset')).toBe('30')
  })
})
