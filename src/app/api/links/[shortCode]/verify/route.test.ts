import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

process.env.QL_ATTRIBUTION_SECRET = 'test-secret-that-is-definitely-32-chars-long!!'

vi.mock('@/lib/link-cache', () => ({ getLinkByCode: vi.fn() }))
import { getLinkByCode } from '@/lib/link-cache'
import { hashGatePassword } from '@/lib/password-gate'
import { POST } from './route'

let n = 0
function call(code: string, body: string, ip = '10.0.0.1') {
  const req = new NextRequest(`http://x/api/links/${code}/verify`, { method: 'POST', body, headers: { 'x-forwarded-for': ip } })
  return POST(req, { params: Promise.resolve({ shortCode: code }) })
}

describe('POST /api/links/:code/verify', () => {
  let code: string
  beforeEach(() => {
    code = `v${++n}${Date.now()}`
    vi.mocked(getLinkByCode).mockResolvedValue({ passwordHash: hashGatePassword('right') } as never)
  })

  it('unlocks with the right password and sets a cookie', async () => {
    const res = await call(code, JSON.stringify({ password: 'right' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toContain(`ql_unlocked_${code}`)
  })
  it('rejects wrong passwords', async () => {
    expect((await call(code, JSON.stringify({ password: 'nope' }))).status).toBe(401)
  })
  it('returns 400 for malformed JSON, non-string and oversized passwords', async () => {
    expect((await call(code, '{bad')).status).toBe(400)
    expect((await call(code, JSON.stringify({ password: { a: 1 } }))).status).toBe(400)
    expect((await call(code, JSON.stringify({ password: 'x'.repeat(257) }))).status).toBe(400)
  })
  it('caps attempts per link across many client IPs', async () => {
    let last = 0
    for (let i = 0; i < 61; i++) last = (await call(code, JSON.stringify({ password: 'bad' }), `10.1.${i}.1`)).status
    expect(last).toBe(429)
  })
})
