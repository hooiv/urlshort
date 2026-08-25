import { describe, expect, it } from 'vitest'
import { rateLimit } from './rate-limit'

function fakeRequest(ip: string): Request {
  return new Request('https://test.local/api/test', { headers: { 'x-forwarded-for': ip } })
}

describe('rateLimit', () => {
  it('allows requests under the limit and blocks over it', async () => {
    const name = `test-${Math.random().toString(36).slice(2)}`
    const options = { name, limit: 3, windowMs: 60_000 }
    for (let i = 0; i < 3; i += 1) {
      const result = await rateLimit(fakeRequest('1.2.3.4'), options)
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(2 - i)
    }
    const blocked = await rateLimit(fakeRequest('1.2.3.4'), options)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('isolates limits per identifier (per IP)', async () => {
    const name = `iso-${Math.random().toString(36).slice(2)}`
    const options = { name, limit: 1, windowMs: 60_000 }
    expect((await rateLimit(fakeRequest('5.6.7.8'), options)).allowed).toBe(true)
    expect((await rateLimit(fakeRequest('5.6.7.8'), options)).allowed).toBe(false)
    // A different IP is unaffected.
    expect((await rateLimit(fakeRequest('9.8.7.6'), options)).allowed).toBe(true)
  })

  it('supports custom identifiers (e.g. account-scoped limits)', async () => {
    const name = `acct-${Math.random().toString(36).slice(2)}`
    const options = { name, limit: 1, windowMs: 60_000, identifier: 'user@example.com' }
    expect((await rateLimit(fakeRequest('1.1.1.1'), options)).allowed).toBe(true)
    expect((await rateLimit(fakeRequest('2.2.2.2'), options)).allowed).toBe(false)
  })

  it('recovers after the window elapses', async () => {
    const name = `win-${Math.random().toString(36).slice(2)}`
    const options = { name, limit: 1, windowMs: 50 }
    expect((await rateLimit(fakeRequest('10.0.0.1'), options)).allowed).toBe(true)
    expect((await rateLimit(fakeRequest('10.0.0.1'), options)).allowed).toBe(false)
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect((await rateLimit(fakeRequest('10.0.0.1'), options)).allowed).toBe(true)
  })
})
