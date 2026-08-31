import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

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
