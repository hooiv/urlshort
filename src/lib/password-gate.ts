import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const PREFIX = 'scrypt$'
const KEY_LENGTH = 64

/** Versioned password hashes. A unique random salt prevents cross-link password correlation. */
export function hashGatePassword(password: string): string {
  const salt = randomBytes(16).toString('base64url')
  const key = scryptSync(password, salt, KEY_LENGTH).toString('base64url')
  return `${PREFIX}${salt}$${key}`
}

export function verifyGatePassword(password: string, stored: string): boolean {
  if (!stored.startsWith(PREFIX)) {
    // Legacy links used a fixed salt. Keep them readable so upgrades do not
    // invalidate existing protected links; callers can migrate on next save.
    const legacy = scryptSync(password, 'ql_salt', KEY_LENGTH).toString('hex')
    return timingSafeEqual(Buffer.from(legacy), Buffer.from(stored))
  }

  const [, salt, encoded] = stored.split('$')
  if (!salt || !encoded) return false
  try {
    const actual = Buffer.from(scryptSync(password, salt, KEY_LENGTH).toString('base64url'))
    const expected = Buffer.from(encoded)
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

function unlockSecret(): string {
  const secret = process.env.QL_ATTRIBUTION_SECRET
  if (!secret || secret.length < 32) throw new Error('QL_ATTRIBUTION_SECRET must be at least 32 characters')
  return secret
}

/**
 * Single source of truth for the `ql_unlocked_<code>` cookie scheme, shared
 * by the password-verify endpoint (issuer) and the redirect hot path
 * (checker). The token is deterministic per link so verification is a
 * constant-time HMAC comparison — no database lookup on the hot path.
 */
export function createUnlockToken(shortCode: string): string {
  return createHmac('sha256', unlockSecret()).update(`unlock:${shortCode}`).digest('hex')
}

export function verifyUnlockToken(shortCode: string, value: string | null | undefined): boolean {
  if (!value) return false
  try {
    const expected = Buffer.from(createUnlockToken(shortCode), 'utf8')
    const actual = Buffer.from(value, 'utf8')
    return expected.length === actual.length && timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}
