export const VERIFY_TOKEN_MIN_LENGTH = 16
const TOKEN_PATTERN = /^[A-Za-z0-9\-_+/=]+$/

/** Email tokens arrive via ?token=; validate shape before POSTing to avoid junk requests. */
export function isValidVerifyToken(token: string): boolean {
  const trimmed = token.trim()
  return trimmed.length >= VERIFY_TOKEN_MIN_LENGTH && TOKEN_PATTERN.test(trimmed)
}

export type VerifyStatus = 'verifying' | 'success' | 'error'

export function getMissingTokenError(): string {
  return 'This link is missing its verification token.'
}

export function getInvalidTokenError(): string {
  return 'This verification link looks invalid. Request a new link from your account page.'
}
