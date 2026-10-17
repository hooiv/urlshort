import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const prismaMock = vi.hoisted(() => ({
  apiKey: { findUnique: vi.fn(), update: vi.fn() },
}))
vi.mock('./prisma', () => ({ prisma: prismaMock }))

import { authenticateApiKey, parseApiKeyExpiry, apiKeyMatches, createApiKey, hasAnyApiScope, hasApiScope, hashApiKey } from './api-keys'

function requestWith(headers: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost/api/test', { headers })
}

describe('hasApiScope', () => {
  it('grants wildcard keys any scope', () => {
    expect(hasApiScope({ userId: 'u', apiKeyId: 'k', scopes: ['*'] }, 'campaign:write')).toBe(true)
  })

  it('matches exact scopes only (no substring confusion)', () => {
    const auth = { userId: 'u', apiKeyId: 'k', scopes: ['campaign:read'] }
    expect(hasApiScope(auth, 'campaign:read')).toBe(true)
    expect(hasApiScope(auth, 'campaign')).toBe(false)
    expect(hasApiScope(auth, 'campaign:readwrite')).toBe(false)
    expect(hasApiScope(auth, 'campaign:write')).toBe(false)
  })

  it('denies scope-less keys everything', () => {
    expect(hasApiScope({ userId: 'u', apiKeyId: 'k', scopes: [] }, 'campaign:read')).toBe(false)
  })
})

describe('hasAnyApiScope', () => {
  it('grants when any one of the accepted scopes is held (mcp OR-pattern)', () => {
    const auth = { userId: 'u', apiKeyId: 'k', scopes: ['mcp:read'] }
    expect(hasAnyApiScope(auth, ['campaign:read', 'mcp:read'])).toBe(true)
  })

  it('denies when none of the accepted scopes is held', () => {
    const auth = { userId: 'u', apiKeyId: 'k', scopes: ['campaign:read'] }
    expect(hasAnyApiScope(auth, ['campaign:write', 'mcp:write'])).toBe(false)
  })

  it('grants wildcard keys regardless of the accepted set', () => {
    const auth = { userId: 'u', apiKeyId: 'k', scopes: ['*'] }
    expect(hasAnyApiScope(auth, ['edge:write', 'mcp:write'])).toBe(true)
  })
})

describe('createApiKey / hashApiKey / apiKeyMatches', () => {
  it('creates unique qlk_-prefixed keys verifiable by hash', () => {
    const a = createApiKey()
    const b = createApiKey()
    expect(a.key).toMatch(/^qlk_/)
    expect(a.key).not.toBe(b.key)
    expect(a.keyHash).toBe(hashApiKey(a.key))
    expect(apiKeyMatches(a.key, a.keyHash)).toBe(true)
    expect(apiKeyMatches(b.key, a.keyHash)).toBe(false)
  })
})

describe('authenticateApiKey', () => {
  beforeEach(() => vi.clearAllMocks())

  it('authenticates via x-api-key and parses comma/space scopes', async () => {
    const { key } = createApiKey()
    prismaMock.apiKey.findUnique.mockResolvedValue({ id: 'k1', userId: 'u1', revokedAt: null, scopes: 'campaign:read, mcp:write' })
    prismaMock.apiKey.update.mockResolvedValue({})
    const auth = await authenticateApiKey(requestWith({ 'x-api-key': key }))
    expect(auth).toMatchObject({ userId: 'u1', apiKeyId: 'k1', scopes: ['campaign:read', 'mcp:write'] })
    expect(prismaMock.apiKey.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { keyHash: hashApiKey(key) } }),
    )
  })

  it('enforces the IP allowlist using the client address', async () => {
    const { key } = createApiKey()
    prismaMock.apiKey.findUnique.mockResolvedValue({ id: 'k1', userId: 'u1', revokedAt: null, scopes: '*', allowedIps: ['203.0.113.0/24'] })
    prismaMock.apiKey.update.mockResolvedValue({})
    expect(await authenticateApiKey(requestWith({ 'x-api-key': key, 'x-forwarded-for': '203.0.113.9' }))).toMatchObject({ userId: 'u1' })
    expect(await authenticateApiKey(requestWith({ 'x-api-key': key, 'x-forwarded-for': '198.51.100.1' }))).toBeNull()
    expect(await authenticateApiKey(requestWith({ 'x-api-key': key }))).toBeNull()
  })

  it('authenticates via Bearer and rejects revoked keys', async () => {
    const { key } = createApiKey()
    prismaMock.apiKey.findUnique.mockResolvedValue({ id: 'k1', userId: 'u1', revokedAt: new Date(), scopes: '*' })
    const auth = await authenticateApiKey(requestWith({ authorization: `Bearer ${key}` }))
    expect(auth).toBeNull()
  })

  it('rejects unknown keys and non-qlk bearers (no scope confusion with management tokens)', async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue(null)
    prismaMock.apiKey.update.mockResolvedValue({})
    expect(await authenticateApiKey(requestWith({ authorization: 'Bearer some-management-token' }))).toBeNull()
    expect(prismaMock.apiKey.findUnique).not.toHaveBeenCalled()
    const { key } = createApiKey()
    expect(await authenticateApiKey(requestWith({ 'x-api-key': key }))).toBeNull()
  })
})

describe('api key expiry and last-used throttle', () => {
  beforeEach(() => { prismaMock.apiKey.findUnique.mockReset(); prismaMock.apiKey.update.mockReset().mockResolvedValue({}) })
  const base = { id: 'k1', userId: 'u1', revokedAt: null, scopes: '*', lastUsedAt: null }
  const req = () => requestWith({ 'x-api-key': 'qlk_abc_def' })

  it('rejects expired keys', async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue({ ...base, expiresAt: new Date(Date.now() - 1000) })
    expect(await authenticateApiKey(req())).toBeNull()
    expect(prismaMock.apiKey.update).not.toHaveBeenCalled()
  })
  it('accepts keys that have not expired and records first use', async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue({ ...base, expiresAt: new Date(Date.now() + 60_000) })
    expect((await authenticateApiKey(req()))?.userId).toBe('u1')
    expect(prismaMock.apiKey.update).toHaveBeenCalledTimes(1)
  })
  it('skips the lastUsedAt write when used within 5 minutes', async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue({ ...base, expiresAt: null, lastUsedAt: new Date(Date.now() - 60_000) })
    expect(await authenticateApiKey(req())).not.toBeNull()
    expect(prismaMock.apiKey.update).not.toHaveBeenCalled()
  })
})

describe('parseApiKeyExpiry', () => {
  const now = new Date('2026-01-01T00:00:00Z')
  it('computes the expiry date', () => { expect(parseApiKeyExpiry(30, now)?.toISOString()).toBe('2026-01-31T00:00:00.000Z') })
  it('treats absent as no expiry', () => { expect(parseApiKeyExpiry(undefined, now)).toBeUndefined() })
  it.each([0, 731, 1.5, '30', NaN])('rejects %s', (v) => { expect(parseApiKeyExpiry(v, now)).toBeNull() })
})

import { parseRotationGrace as _prg, rotatedKeyExpiry as _rke } from './api-keys'
import { describe as d2, it as i2, expect as e2 } from 'vitest'
d2('key rotation helpers', () => {
  const now = new Date('2026-01-01T00:00:00Z')
  i2('parses grace hours', () => {
    e2(_prg(undefined)).toBe(24)
    e2(_prg(0)).toBe(0)
    e2(_prg(168)).toBe(168)
    e2(_prg(169)).toBeNull()
    e2(_prg(-1)).toBeNull()
    e2(_prg(1.5)).toBeNull()
    e2(_prg('5')).toBeNull()
  })
  i2('caps old key expiry at its own earlier expiry', () => {
    e2(_rke(null, 24, now).toISOString()).toBe('2026-01-02T00:00:00.000Z')
    e2(_rke(new Date('2026-01-01T06:00:00Z'), 24, now).toISOString()).toBe('2026-01-01T06:00:00.000Z')
    e2(_rke(new Date('2026-03-01T00:00:00Z'), 2, now).toISOString()).toBe('2026-01-01T02:00:00.000Z')
  })
})
