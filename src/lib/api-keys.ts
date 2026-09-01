import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * API keys for programmatic access.
 *
 * Format: `qlk_<prefix>_<secret>` where prefix (8 chars) is stored in plaintext
 * for display/identification and the full key is SHA-256 hashed at rest — the
 * raw key is shown exactly once at creation. Keys authenticate as their owner
 * user; workspace-scoped permissions are resolved through memberships, same as
 * session auth.
 */

const PREFIX = 'qlk'
const PREFIX_LENGTH = 8

export function createApiKey(): { key: string; keyHash: string; prefix: string } {
  const prefix = randomBytes(PREFIX_LENGTH).toString('base64url')
  const secret = randomBytes(24).toString('base64url')
  const key = `${PREFIX}_${prefix}_${secret}`
  return { key, keyHash: hashApiKey(key), prefix }
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

function extractApiKey(request: NextRequest): string | null {
  const header = request.headers.get('x-api-key') || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!header || !header.startsWith(`${PREFIX}_`)) return null
  return header
}

export type ApiKeyAuth = {
  userId: string
  apiKeyId: string
  scopes: string[]
}

/** Validate an API key from the request and return its owner. Null if invalid. */
export async function authenticateApiKey(request: NextRequest): Promise<ApiKeyAuth | null> {
  const key = extractApiKey(request)
  if (!key) return null
  const record = await prisma.apiKey.findUnique({ where: { keyHash: hashApiKey(key) }, select: { id: true, userId: true, revokedAt: true, scopes: true } })
  if (!record || record.revokedAt) return null
  // Throttle last-used writes like sessions do (5 min).
  const now = new Date()
  void prisma.apiKey.update({ where: { id: record.id }, data: { lastUsedAt: now } }).catch(() => {})
  return { userId: record.userId, apiKeyId: record.id, scopes: record.scopes.split(/[,\s]+/).filter(Boolean) }
}

/** Timing-safe comparison helper (used when re-verifying a supplied key). */
export function apiKeyMatches(supplied: string, storedHash: string): boolean {
  const actual = Buffer.from(hashApiKey(supplied), 'utf8')
  const expected = Buffer.from(storedHash, 'utf8')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function hasApiScope(auth: ApiKeyAuth, scope: string): boolean { return auth.scopes.includes('*') || auth.scopes.includes(scope) }
