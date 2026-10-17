import { ipAllowed } from '@/lib/ip-allowlist'
import { getClientIp } from '@/lib/rate-limit'
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
const LAST_USED_THROTTLE_MS = 5 * 60_000
export const MAX_API_KEY_TTL_DAYS = 730

/** Parse an optional `expiresInDays` (1..730). Returns undefined for absent, null for invalid. */
export function parseApiKeyExpiry(value: unknown, now = new Date()): Date | undefined | null {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_API_KEY_TTL_DAYS) return null
  return new Date(now.getTime() + value * 86_400_000)
}

export function createApiKey(): { key: string; keyHash: string; prefix: string } {
  const prefix = randomBytes(PREFIX_LENGTH).toString('base64url')
  const secret = randomBytes(24).toString('base64url')
  const key = `${PREFIX}_${prefix}_${secret}`
  return { key, keyHash: hashApiKey(key), prefix }
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

export function extractApiKey(request: NextRequest): string | null {
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
  const record = await prisma.apiKey.findUnique({ where: { keyHash: hashApiKey(key) }, select: { id: true, userId: true, revokedAt: true, scopes: true, expiresAt: true, lastUsedAt: true, allowedIps: true } })
  const now = new Date()
  if (!record || record.revokedAt) return null
  if (record.expiresAt && record.expiresAt <= now) return null
  if (record.allowedIps?.length && !ipAllowed(getClientIp(request), record.allowedIps)) return null
  // Throttle last-used writes to one per 5 minutes per key.
  if (!record.lastUsedAt || now.getTime() - record.lastUsedAt.getTime() >= LAST_USED_THROTTLE_MS) {
    void prisma.apiKey.update({ where: { id: record.id }, data: { lastUsedAt: now } }).catch(() => {})
  }
  return { userId: record.userId, apiKeyId: record.id, scopes: record.scopes.split(/[,\s]+/).filter(Boolean) }
}

/** Timing-safe comparison helper (used when re-verifying a supplied key). */
export function apiKeyMatches(supplied: string, storedHash: string): boolean {
  const actual = Buffer.from(hashApiKey(supplied), 'utf8')
  const expected = Buffer.from(storedHash, 'utf8')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function hasApiScope(auth: ApiKeyAuth, scope: string): boolean { return auth.scopes.includes('*') || auth.scopes.includes(scope) }

/**
 * OR-semantics scope check: true when the key holds a wildcard or ANY of the
 * listed scopes. Use this (not ad-hoc `&&`/`||` chains) wherever an operation
 * accepts several equivalent scopes, e.g. `campaign:read` or `mcp:read`.
 */
export function hasAnyApiScope(auth: ApiKeyAuth, scopes: string[]): boolean { return scopes.some((scope) => hasApiScope(auth, scope)) }

export const DEFAULT_ROTATION_GRACE_HOURS = 24
export const MAX_ROTATION_GRACE_HOURS = 168

/** Parse `graceHours` for key rotation (0..168, integer). Undefined → default; null → invalid. */
export function parseRotationGrace(value: unknown): number | null {
  if (value === undefined || value === null) return DEFAULT_ROTATION_GRACE_HOURS
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > MAX_ROTATION_GRACE_HOURS) return null
  return value
}

/**
 * Compute the old key's new expiry when rotating: it keeps working for `graceHours`
 * (never beyond its own existing expiry) so deployments can swap secrets without downtime.
 */
export function rotatedKeyExpiry(existing: Date | null, graceHours: number, now = new Date()): Date {
  const graceEnd = new Date(now.getTime() + graceHours * 3_600_000)
  return existing && existing < graceEnd ? existing : graceEnd
}
