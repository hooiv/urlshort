import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const prismaMock = vi.hoisted(() => ({
  idempotencyKey: { findUnique: vi.fn(), upsert: vi.fn() },
}))
vi.mock('./prisma', () => ({ prisma: prismaMock }))

import { getIdempotentResponse, requestHash, storeIdempotentResponse } from './idempotency'

function postRequest(path: string, key?: string, method = 'POST'): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: key ? { 'idempotency-key': key } : {},
  })
}

describe('getIdempotentResponse', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns null when no key header is present', async () => {
    expect(await getIdempotentResponse(postRequest('/api/campaigns'), 'ws1', { a: 1 })).toBeNull()
    expect(prismaMock.idempotencyKey.findUnique).not.toHaveBeenCalled()
  })

  it('treats an expired record as a miss for clean reuse', async () => {
    prismaMock.idempotencyKey.findUnique.mockResolvedValue({
      keyHash: 'h', requestHash: 'old', method: 'POST', path: '/api/campaigns',
      responseStatus: 201, responseJson: '{}', expiresAt: new Date(Date.now() - 1_000),
    })
    const result = await getIdempotentResponse(postRequest('/api/campaigns', 'reuse-key-1'), 'ws1', { a: 2 })
    expect(result?.existing).toBeNull()
  })

  it('replays the stored response for the same endpoint and body', async () => {
    const body = { name: 'Launch' }
    prismaMock.idempotencyKey.findUnique.mockResolvedValue({
      keyHash: 'h', requestHash: requestHash(body), method: 'POST', path: '/api/campaigns',
      responseStatus: 201, responseJson: '{"ok":true}', expiresAt: new Date(Date.now() + 60_000),
    })
    const result = await getIdempotentResponse(postRequest('/api/campaigns', 'replay-key-1'), 'ws1', body)
    expect(result?.existing).toMatchObject({ responseStatus: 201 })
  })

  it('rejects the same key with a different body on the same endpoint', async () => {
    prismaMock.idempotencyKey.findUnique.mockResolvedValue({
      keyHash: 'h', requestHash: 'different', method: 'POST', path: '/api/campaigns',
      responseStatus: 201, responseJson: '{}', expiresAt: new Date(Date.now() + 60_000),
    })
    await expect(getIdempotentResponse(postRequest('/api/campaigns', 'clash-key-1'), 'ws1', { b: 1 })).rejects.toThrow(
      'different request',
    )
  })

  it('rejects the same key and body replayed on a different endpoint', async () => {
    const body = { whatever: true }
    prismaMock.idempotencyKey.findUnique.mockResolvedValue({
      keyHash: 'h', requestHash: requestHash(body), method: 'POST', path: '/api/campaigns',
      responseStatus: 201, responseJson: '{"campaign":1}', expiresAt: new Date(Date.now() + 60_000),
    })
    await expect(getIdempotentResponse(postRequest('/api/shorten', 'cross-endpoint-1'), 'ws1', body)).rejects.toThrow(
      'different request',
    )
  })
})

describe('storeIdempotentResponse', () => {
  beforeEach(() => vi.clearAllMocks())

  it('refreshes the request binding on upsert-update so post-expiry reuse does not poison retries', async () => {
    prismaMock.idempotencyKey.upsert.mockResolvedValue({})
    await storeIdempotentResponse({
      workspaceId: 'ws1', keyHash: 'h', requestHash: 'new-hash',
      method: 'POST', path: '/api/campaigns', status: 201, body: { ok: true },
    })
    const args = prismaMock.idempotencyKey.upsert.mock.calls[0][0]
    expect(args.update).toMatchObject({ requestHash: 'new-hash', method: 'POST', path: '/api/campaigns' })
    expect(args.create).toMatchObject({ requestHash: 'new-hash', method: 'POST', path: '/api/campaigns' })
  })
})
