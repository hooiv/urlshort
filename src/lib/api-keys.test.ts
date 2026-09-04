import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const prismaMock = vi.hoisted(() => ({
  apiKey: { findUnique: vi.fn(), update: vi.fn() },
}))
vi.mock('./prisma', () => ({ prisma: prismaMock }))

import { authenticateApiKey, apiKeyMatches, createApiKey, hasAnyApiScope, hasApiScope, hashApiKey } from './api-keys'

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
