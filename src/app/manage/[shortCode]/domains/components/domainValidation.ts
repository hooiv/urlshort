/**
 * Pure branded-domain validation for the domains console.
 *
 * The hostname/path patterns intentionally mirror the server-side
 * `normalizeHost`/`normalizePath` rules so obviously-invalid input is rejected
 * before a network round-trip. (The server module cannot be imported here —
 * it pulls in node-only crypto/dns.)
 */

/** Same shape as the server hostname rule: dotted public hostname. */
export const HOSTNAME_PATTERN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

/** Same shape as the server path rule, e.g. `/summer-sale`. */
export const PATH_PATTERN = /^\/[A-Za-z0-9][A-Za-z0-9._~-]{0,63}$/

export type FieldResult = { value: string } | { error: string }

export function isFieldError(result: FieldResult): result is { error: string } {
  return 'error' in result
}

export function validateHostname(input: string): FieldResult {
  const value = input.trim().toLowerCase().replace(/\.$/, '')
  if (!value) return { error: 'Enter a domain host' }
  if (value.length > 253 || value.includes('/') || value.includes(':')) {
    return { error: 'Enter a valid hostname' }
  }
  if (value === 'localhost' || value.endsWith('.local') || value.endsWith('.internal')) {
    return { error: 'Private hostnames are not allowed' }
  }
  if (!HOSTNAME_PATTERN.test(value)) {
    return { error: 'Enter a public hostname such as go.example.com' }
  }
  return { value }
}

export function validateDomainPath(input: string): FieldResult {
  const raw = input.trim()
  if (!raw) return { error: 'Enter a path such as /summer-sale' }
  const value = raw.startsWith('/') ? raw : `/${raw}`
  if (!PATH_PATTERN.test(value)) return { error: 'Path must look like /summer-sale' }
  return { value }
}

export type DomainFormResult =
  | { ok: true; host: string; path: string }
  | { ok: false; error: string }

/** Validate the connect/verify form; hostname errors take precedence. */
export function validateDomainForm(hostInput: string, pathInput: string): DomainFormResult {
  const host = validateHostname(hostInput)
  if (isFieldError(host)) return { ok: false, error: host.error }
  const path = validateDomainPath(pathInput)
  if (isFieldError(path)) return { ok: false, error: path.error }
  return { ok: true, host: host.value, path: path.value }
}

/** Canonical branded URL shown in the bindings list and copy actions. */
export function buildBrandedUrl(host: string, path: string): string {
  return `https://${host}${path}`
}

export function manageTokenKey(shortCode: string): string {
  return `ql-token:${shortCode}`
}

/** sessionStorage access that never throws (private mode, SSR, or blocked storage). */
export function readSessionToken(key: string): string | null {
  try {
    if (typeof window === 'undefined') return null
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}
