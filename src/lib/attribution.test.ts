import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { appendAttribution, createAttributionToken, generatePublicEventKey, hashVisitorId, verifyAttributionToken } from './attribution'

beforeAll(() => {
  process.env.QL_ATTRIBUTION_SECRET = 'test-secret-that-is-definitely-32-chars-long!!'
})

afterAll(() => {
  delete process.env.QL_ATTRIBUTION_SECRET
})

const payload = {
  urlId: 'url_1',
  shortCode: 'abc1234',
  clickEventId: 'click_1',
  visitorIdHash: 'vh_1',
  issuedAt: Date.now(),
}

describe('attribution tokens', () => {
  it('round-trips a valid token', () => {
    const token = createAttributionToken(payload)
    const verified = verifyAttributionToken(token)
    expect(verified).not.toBeNull()
    expect(verified?.urlId).toBe(payload.urlId)
    expect(verified?.clickEventId).toBe(payload.clickEventId)
  })

  it('rejects tampered payloads', () => {
    const token = createAttributionToken(payload)
    const [, , signature] = token.split('.')
    const forged = Buffer.from(JSON.stringify({ ...payload, urlId: 'url_2' }), 'utf8').toString('base64url')
    // Valid signature over a different payload must fail.
    expect(verifyAttributionToken(`v1.${forged}.${signature}`)).toBeNull()
  })

  it('rejects expired tokens', () => {
    const expired = createAttributionToken({ ...payload, issuedAt: Date.now() - 31 * 24 * 60 * 60 * 1000 })
    expect(verifyAttributionToken(expired)).toBeNull()
  })

  it('rejects future-dated tokens', () => {
    const future = createAttributionToken({ ...payload, issuedAt: Date.now() + 60_000 })
    expect(verifyAttributionToken(future)).toBeNull()
  })

  it('rejects malformed tokens', () => {
    expect(verifyAttributionToken('')).toBeNull()
    expect(verifyAttributionToken('garbage')).toBeNull()
    expect(verifyAttributionToken('v2.abc.def')).toBeNull()
    expect(verifyAttributionToken('v1.!!!.???')).toBeNull()
  })

  it('rejects tokens missing required fields', () => {
    const incomplete = createAttributionToken({ urlId: '', shortCode: 'x', clickEventId: 'y', visitorIdHash: 'z', issuedAt: Date.now() })
    expect(verifyAttributionToken(incomplete)).toBeNull()
  })
})

describe('appendAttribution', () => {
  it('appends the token to the hash fragment without sending it to the server', () => {
    const result = appendAttribution('https://example.com/page?x=1', 'tok_123')
    const url = new URL(result)
    expect(url.searchParams.get('ql_attribution')).toBeNull()
    expect(new URLSearchParams(url.hash.replace(/^#/, '')).get('ql_attribution')).toBe('tok_123')
    expect(url.pathname).toBe('/page')
  })

  it('preserves an existing hash fragment', () => {
    const result = appendAttribution('https://example.com/#section=pricing', 'tok')
    expect(result).toContain('section=pricing')
    expect(result).toContain('ql_attribution=tok')
  })
})

describe('hashVisitorId', () => {
  it('is deterministic and differs from the raw id', () => {
    const hash = hashVisitorId('visitor-123')
    expect(hash).toBe(hashVisitorId('visitor-123'))
    expect(hash).not.toBe('visitor-123')
    expect(hash).not.toBe(hashVisitorId('visitor-124'))
  })
})

describe('generatePublicEventKey', () => {
  it('slugifies names', () => {
    expect(generatePublicEventKey('Purchase Completed!')).toBe('purchase_completed')
    expect(generatePublicEventKey('  Lead  Form  ')).toBe('lead_form')
  })

  it('falls back to a random key for empty input', () => {
    expect(generatePublicEventKey('')).toMatch(/^goal_/)
  })
})
