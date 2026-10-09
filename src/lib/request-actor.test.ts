import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const keyMock = vi.hoisted(() => vi.fn())
const userMock = vi.hoisted(() => vi.fn())
vi.mock('./auth', () => ({ getCurrentUser: userMock }))
vi.mock('./api-keys', async (orig) => ({ ...(await orig<typeof import('./api-keys')>()), authenticateApiKey: keyMock }))

import { LINK_WRITE_SCOPES, resolveActor } from './request-actor'

const req = (headers: Record<string, string> = {}) => new NextRequest('https://ql.test/api/shorten', { headers })

describe('resolveActor', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uses the session when no key is sent', async () => {
    userMock.mockResolvedValue({ id: 'u1' })
    expect(await resolveActor(req(), LINK_WRITE_SCOPES)).toEqual({ actor: { kind: 'session', userId: 'u1' } })
    userMock.mockResolvedValue(null)
    expect(await resolveActor(req(), LINK_WRITE_SCOPES)).toMatchObject({ actor: null, status: 401 })
  })

  it('never falls back to the cookie when a key is sent', async () => {
    userMock.mockResolvedValue({ id: 'cookie-user' })
    keyMock.mockResolvedValue(null)
    expect(await resolveActor(req({ 'x-api-key': 'qlk_bad' }), LINK_WRITE_SCOPES)).toMatchObject({ actor: null, status: 401 })
    expect(userMock).not.toHaveBeenCalled()
  })

  it('enforces key scopes', async () => {
    keyMock.mockResolvedValue({ userId: 'u2', apiKeyId: 'k', scopes: ['analytics:read'] })
    expect(await resolveActor(req({ authorization: 'Bearer qlk_x' }), LINK_WRITE_SCOPES)).toMatchObject({ actor: null, status: 403 })
    keyMock.mockResolvedValue({ userId: 'u2', apiKeyId: 'k', scopes: ['links:write'] })
    expect(await resolveActor(req({ authorization: 'Bearer qlk_x' }), LINK_WRITE_SCOPES)).toMatchObject({ actor: { kind: 'api_key', userId: 'u2' } })
    keyMock.mockResolvedValue({ userId: 'u2', apiKeyId: 'k', scopes: ['*'] })
    expect((await resolveActor(req({ 'x-api-key': 'qlk_x' }), LINK_WRITE_SCOPES)).actor?.kind).toBe('api_key')
  })
})
