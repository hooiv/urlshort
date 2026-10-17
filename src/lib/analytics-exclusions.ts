import { ipAllowed, parseAllowlist, MAX_ALLOWLIST_ENTRIES } from './ip-allowlist'

/** Maximum number of IP/CIDR entries a workspace can exclude from analytics. */
export const MAX_EXCLUSION_ENTRIES = MAX_ALLOWLIST_ENTRIES

/** Validate and normalise a user-supplied exclusion list; null when any entry is invalid. */
export function parseExclusions(value: unknown): string[] | null {
  return parseAllowlist(value)
}

/**
 * True when a click from `ip` must not be counted (team members testing their
 * own links). Unknown IPs are never excluded, and an empty list excludes nothing.
 */
export function isExcludedFromAnalytics(ip: string | null | undefined, exclusions: readonly string[]): boolean {
  if (!ip || exclusions.length === 0) return false
  if (ip === 'unknown') return false
  return ipAllowed(ip, exclusions)
}
