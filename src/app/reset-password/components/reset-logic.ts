export const RESET_TOKEN_MIN_LENGTH = 16
const TOKEN_PATTERN = /^[A-Za-z0-9\-_+/=]+$/

/** Tokens travel in the email URL; reject blanks and obviously malformed values before POSTing. */
export function isValidResetToken(token: string): boolean {
  const trimmed = token.trim()
  return trimmed.length >= RESET_TOKEN_MIN_LENGTH && TOKEN_PATTERN.test(trimmed)
}

export function validateNewPassword(password: string): string | null {
  if (password.length < 12) return 'Password must be at least 12 characters'
  return null
}

export function doPasswordsMatch(password: string, confirm: string): boolean {
  return password === confirm
}

export function getResetSubmitError(
  token: string,
  password: string,
  confirm: string,
): string | null {
  if (!token.trim()) return 'Missing reset token — use the link from your email'
  if (!isValidResetToken(token)) return 'This reset link looks invalid — request a new one'
  const passwordError = validateNewPassword(password)
  if (passwordError) return passwordError
  if (!doPasswordsMatch(password, confirm)) return 'Passwords do not match'
  return null
}
