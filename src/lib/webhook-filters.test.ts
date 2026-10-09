import { describe, expect, it } from 'vitest'
import {
  endpointMatchesLink,
  parseLinkFilterInput,
  signWebhookPayload,
  verifyTimestampedWebhookSignature,
} from './webhook-filters'

const link = { id: 'url_1', tags: ['launch', 'q4'] }

describe('endpointMatchesLink', () => {
  it('matches every link for scope "all"', () => {
    expect(endpointMatchesLink({ linkScope: 'all', tagFilter: [], urlIdFilter: [] }, link)).toBe(true)
  })

  it('matches on any shared tag, case-insensitively', () => {
    expect(endpointMatchesLink({ linkScope: 'tags', tagFilter: ['Newsletter', 'LAUNCH'], urlIdFilter: [] }, link)).toBe(true)
    expect(endpointMatchesLink({ linkScope: 'tags', tagFilter: ['newsletter'], urlIdFilter: [] }, link)).toBe(false)
  })

  it('never matches an untagged link or an empty tag filter', () => {
    expect(endpointMatchesLink({ linkScope: 'tags', tagFilter: ['launch'], urlIdFilter: [] }, { id: 'x', tags: [] })).toBe(false)
    expect(endpointMatchesLink({ linkScope: 'tags', tagFilter: [], urlIdFilter: [] }, link)).toBe(false)
  })

  it('matches explicit link ids only', () => {
    expect(endpointMatchesLink({ linkScope: 'links', tagFilter: [], urlIdFilter: ['url_1'] }, link)).toBe(true)
    expect(endpointMatchesLink({ linkScope: 'links', tagFilter: [], urlIdFilter: ['url_2'] }, link)).toBe(false)
  })

  it('fails closed on an unknown scope', () => {
    expect(endpointMatchesLink({ linkScope: 'folders', tagFilter: [], urlIdFilter: ['url_1'] }, link)).toBe(false)
  })
})

describe('parseLinkFilterInput', () => {
  it('defaults to all and discards stray filters', () => {
    expect(parseLinkFilterInput({ tags: ['a'] })).toEqual({ ok: true, linkScope: 'all', tagFilter: [], shortCodes: [], folderIds: [] })
  })

  it('normalises and dedupes tags', () => {
    expect(parseLinkFilterInput({ linkScope: 'tags', tags: [' Launch ', 'launch', 'Q4'] })).toEqual({
      ok: true, linkScope: 'tags', tagFilter: ['launch', 'q4'], shortCodes: [], folderIds: [],
    })
  })

  it('rejects scopes without their filter, bad types and oversized input', () => {
    expect(parseLinkFilterInput({ linkScope: 'tags' }).ok).toBe(false)
    expect(parseLinkFilterInput({ linkScope: 'links', shortCodes: ['  '] }).ok).toBe(false)
    expect(parseLinkFilterInput({ linkScope: 'everything' }).ok).toBe(false)
    expect(parseLinkFilterInput({ linkScope: 'tags', tags: 'launch' }).ok).toBe(false)
    expect(parseLinkFilterInput({ linkScope: 'tags', tags: [1] }).ok).toBe(false)
    expect(parseLinkFilterInput({ linkScope: 'tags', tags: Array.from({ length: 51 }, (_, i) => `t${i}`) }).ok).toBe(false)
    expect(parseLinkFilterInput({ linkScope: 'links', shortCodes: ['x'.repeat(129)] }).ok).toBe(false)
  })
})

describe('timestamped webhook signatures', () => {
  const secret = 'whsec_test_0123456789abcdef'
  const payload = JSON.stringify({ id: 'evt_1', type: 'link.clicked' })
  const t = 1_790_000_000

  it('round-trips within tolerance', () => {
    const header = signWebhookPayload(payload, secret, t)
    expect(header).toMatch(/^t=1790000000,v1=[0-9a-f]{64}$/)
    expect(verifyTimestampedWebhookSignature(payload, secret, header, { nowSeconds: t + 299 })).toBe(true)
  })

  it('rejects replays outside the tolerance window', () => {
    const header = signWebhookPayload(payload, secret, t)
    expect(verifyTimestampedWebhookSignature(payload, secret, header, { nowSeconds: t + 301 })).toBe(false)
    expect(verifyTimestampedWebhookSignature(payload, secret, header, { nowSeconds: t - 301 })).toBe(false)
  })

  it('binds the timestamp into the MAC', () => {
    const header = signWebhookPayload(payload, secret, t)
    const forged = header.replace(`t=${t}`, `t=${t + 100}`)
    expect(verifyTimestampedWebhookSignature(payload, secret, forged, { nowSeconds: t + 100 })).toBe(false)
  })

  it('rejects tampered bodies, wrong secrets and malformed headers', () => {
    const header = signWebhookPayload(payload, secret, t)
    expect(verifyTimestampedWebhookSignature(payload + ' ', secret, header, { nowSeconds: t })).toBe(false)
    expect(verifyTimestampedWebhookSignature(payload, 'other', header, { nowSeconds: t })).toBe(false)
    expect(verifyTimestampedWebhookSignature(payload, secret, 'garbage', { nowSeconds: t })).toBe(false)
    expect(verifyTimestampedWebhookSignature(payload, secret, `t=${t}`, { nowSeconds: t })).toBe(false)
  })

  it('accepts any of several v1 signatures (secret rotation)', () => {
    const fresh = signWebhookPayload(payload, secret, t).split(',')[1]
    const stale = signWebhookPayload(payload, 'old-secret', t).split(',')[1]
    expect(verifyTimestampedWebhookSignature(payload, secret, `t=${t},${stale},${fresh}`, { nowSeconds: t })).toBe(true)
  })
})
