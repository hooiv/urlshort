/** Normalize the dynamic-segment value into a usable short code. */
export function parseShortCode(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) {
    const first = value.find((entry) => typeof entry === 'string' && entry.trim().length > 0)
    return typeof first === 'string' ? first.trim() : ''
  }
  return ''
}

/** API endpoint for a password gate check. The code is path-encoded to block traversal. */
export function buildVerifyUrl(shortCode: string): string {
  return `/api/links/${encodeURIComponent(shortCode)}/verify`
}

/** Post-unlock destination. Encoded so hostile codes cannot escape the short-link route. */
export function buildUnlockPath(shortCode: string): string {
  return `/${encodeURIComponent(shortCode)}`
}

export function isValidShortCode(shortCode: string): boolean {
  return shortCode.length > 0 && shortCode.length <= 128 && !shortCode.includes('/')
}
