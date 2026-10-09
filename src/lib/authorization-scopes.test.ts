import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const authenticateApiKey = vi.fn()
const getCurrentUser = vi.fn()
const findMembership = vi.fn()

vi.mock('@/lib/api-keys', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-keys')>('@/lib/api-keys')
  return { ...actual, authenticateApiKey: (...a: unknown[]) => authenticateApiKey(...a) }
})
vi.mock('@/lib/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }))
vi.mock('@/lib/prisma', () => ({ prisma: { membership: { findUnique: (...a: unknown[]) => findMembership(...a) }, url: { findUnique: vi.fn() } } }))
vi.mock('@/lib/folders', () => ({ roleWithinFolder: async (_u: string, role: string | null) => role }))

import { canManageUrl, EDIT_ROLES, READ_ROLES } from '@/lib/authorization'

const request = {} as NextRequest
const url = { userId: 'owner-1', managementTokenHash: null, workspaceId: null, folderId: null }

function key(scopes: string[], userId = 'owner-1') {
  authenticateApiKey.mockResolvedValue({ userId, apiKeyId: 'k1', scopes })
}

describe('canManageUrl API-key scope matrix', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentUser.mockResolvedValue(null)
    findMembership.mockResolvedValue(null)
  })

  it.each([
    [['links:write'], true],
    [['*'], true],
    [['links:read'], false],
    [['analytics:read'], false],
    [['webhooks:write'], false],
    [[], false],
  ])('edit routes with scopes %j → %s', async (scopes, allowed) => {
    key(scopes)
    expect(await canManageUrl(request, url, EDIT_ROLES)).toBe(allowed)
  })

  it.each([
    [['analytics:read'], true],
    [['links:read'], true],
    [['links:write'], true],
    [['webhooks:write'], false],
    [[], false],
  ])('read routes with scopes %j → %s', async (scopes, allowed) => {
    key(scopes)
    expect(await canManageUrl(request, url, READ_ROLES)).toBe(allowed)
  })

  it('a fully scoped key still cannot act on a link its owner has no role on', async () => {
    key(['*'], 'stranger')
    expect(await canManageUrl(request, { ...url, workspaceId: 'ws' }, EDIT_ROLES)).toBe(false)
  })

  it('a workspace viewer key with links:write cannot edit', async () => {
    key(['links:write'], 'viewer-1')
    findMembership.mockResolvedValue({ role: 'viewer' })
    expect(await canManageUrl(request, { ...url, workspaceId: 'ws' }, EDIT_ROLES)).toBe(false)
    expect(await canManageUrl(request, { ...url, workspaceId: 'ws' }, READ_ROLES)).toBe(true)
  })
})
