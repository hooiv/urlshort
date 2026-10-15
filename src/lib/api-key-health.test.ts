import { describe, expect, it } from 'vitest'
import { classifyApiKey } from './api-key-health'

const now = new Date('2026-10-15T00:00:00Z')
const d = (n: number) => new Date(now.getTime() + n * 86_400_000)
const base = { scopes: 'links:read', lastUsedAt: d(-1), revokedAt: null, expiresAt: null, allowedIps: [], createdAt: d(-200) }

describe('classifyApiKey', () => {
  it('revoked wins over everything', () => expect(classifyApiKey({ ...base, revokedAt: d(-1), expiresAt: d(-5) }, now).status).toBe('revoked'))
  it('expired', () => expect(classifyApiKey({ ...base, expiresAt: d(-1) }, now).status).toBe('expired'))
  it('expiring within 14 days, singular wording', () => {
    const h = classifyApiKey({ ...base, expiresAt: d(1) }, now)
    expect(h.status).toBe('expiring')
    expect(h.advice).toContain('1 day.')
  })
  it('far expiry is healthy', () => expect(classifyApiKey({ ...base, expiresAt: d(60) }, now).status).toBe('healthy'))
  it('unused after grace, healthy within grace', () => {
    expect(classifyApiKey({ ...base, lastUsedAt: null }, now).status).toBe('unused')
    expect(classifyApiKey({ ...base, lastUsedAt: null, createdAt: d(-2) }, now).status).toBe('healthy')
  })
  it('stale after 90 days', () => expect(classifyApiKey({ ...base, lastUsedAt: d(-91) }, now).status).toBe('stale'))
  it('flags broad keys only without allowlist', () => {
    expect(classifyApiKey({ ...base, scopes: '*' }, now).broad).toBe(true)
    expect(classifyApiKey({ ...base, scopes: '*', allowedIps: ['10.0.0.0/8'] }, now).broad).toBe(false)
    expect(classifyApiKey(base, now).broad).toBe(false)
  })
})
