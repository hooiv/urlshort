export type ApiKeyHealthStatus = 'revoked' | 'expired' | 'expiring' | 'stale' | 'unused' | 'healthy'

export type ApiKeyHealth = {
  status: ApiKeyHealthStatus
  /** Human-readable advice for the owner; absent when the key is healthy. */
  advice?: string
  /** True when the key holds every scope and has no IP allowlist. */
  broad: boolean
}

export const API_KEY_STALE_DAYS = 90
export const API_KEY_EXPIRING_DAYS = 14
export const API_KEY_UNUSED_GRACE_DAYS = 7
const DAY_MS = 86_400_000

type KeyLike = {
  scopes: string
  lastUsedAt: Date | null
  revokedAt: Date | null
  expiresAt: Date | null
  allowedIps: string[]
  createdAt: Date
}

/** Classify an API key so owners can rotate or revoke credentials that are dead, dormant or too powerful. */
export function classifyApiKey(key: KeyLike, now = new Date()): ApiKeyHealth {
  const broad = key.scopes.split(',').map((s) => s.trim()).includes('*') && key.allowedIps.length === 0
  if (key.revokedAt) return { status: 'revoked', broad }
  if (key.expiresAt && key.expiresAt.getTime() <= now.getTime()) {
    return { status: 'expired', advice: 'Expired keys no longer authenticate. Create a replacement and delete this one.', broad }
  }
  if (key.expiresAt) {
    const days = Math.ceil((key.expiresAt.getTime() - now.getTime()) / DAY_MS)
    if (days <= API_KEY_EXPIRING_DAYS) {
      return { status: 'expiring', advice: `Expires in ${days} day${days === 1 ? '' : 's'}. Rotate it before integrations break.`, broad }
    }
  }
  if (!key.lastUsedAt) {
    if (now.getTime() - key.createdAt.getTime() > API_KEY_UNUSED_GRACE_DAYS * DAY_MS) {
      return { status: 'unused', advice: 'Never used since it was created. Revoke it if nothing needs it.', broad }
    }
    return { status: 'healthy', broad }
  }
  if (now.getTime() - key.lastUsedAt.getTime() > API_KEY_STALE_DAYS * DAY_MS) {
    return { status: 'stale', advice: `Not used in over ${API_KEY_STALE_DAYS} days. Revoke dormant credentials.`, broad }
  }
  return { status: 'healthy', broad }
}
