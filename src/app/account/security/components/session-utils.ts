export type Session = {
  id: string
  userAgent: string | null
  createdAt: string
  lastSeenAt: string
  expiresAt: string
  current: boolean
}

export const MIN_SESSION_PASSWORD_LENGTH = 12

/** Device label for a session user-agent string. Pure and safe for null input. */
export function labelSessionDevice(userAgent: string | null | undefined): string {
  if (!userAgent) return 'Unknown device'
  if (/iphone|android/i.test(userAgent)) return 'Mobile device'
  if (/windows/i.test(userAgent)) return 'Windows device'
  if (/mac os/i.test(userAgent)) return 'Mac device'
  return 'Browser session'
}

/** Returns an error message for an invalid password change, or null when submittable. */
export function validatePasswordChange(input: {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}): string | null {
  if (!input.currentPassword) return 'Enter your current password'
  if (input.newPassword !== input.confirmPassword) return 'New passwords do not match'
  if (input.newPassword.length < MIN_SESSION_PASSWORD_LENGTH)
    return 'New password must be at least 12 characters'
  return null
}

/** DELETE body for /api/auth/sessions: {} revokes all others, { sessionId } revokes one. */
export function buildRevokeBody(sessionId?: string): Record<string, string> {
  const trimmed = (sessionId ?? '').trim()
  return trimmed ? { sessionId: trimmed } : {}
}
