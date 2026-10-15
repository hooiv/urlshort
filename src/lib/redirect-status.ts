/**
 * Per-link redirect status code. 307 stays the default (method-preserving,
 * never cached by browsers, so edits and routing rules take effect at once).
 * Links may opt into 301/308 (permanent, SEO link-equity transfer) or 302.
 * Permanent codes are cacheable by browsers, so they are refused on links whose
 * destination can change per visitor (password, schedule, click limit, expiry).
 */
export const REDIRECT_STATUSES = [301, 302, 307, 308] as const
export type RedirectStatus = (typeof REDIRECT_STATUSES)[number]
export const DEFAULT_REDIRECT_STATUS: RedirectStatus = 307

/** Returns the status to store (null = default). Throws on invalid input. */
export function parseRedirectStatus(input: unknown): RedirectStatus | null {
  if (input === null || input === undefined || input === '') return null
  const n = typeof input === 'string' && /^\d{3}$/.test(input.trim()) ? Number(input) : input
  if (typeof n !== 'number' || !(REDIRECT_STATUSES as readonly number[]).includes(n)) {
    throw new Error('redirectStatus must be one of 301, 302, 307 or 308')
  }
  return n === DEFAULT_REDIRECT_STATUS ? null : (n as RedirectStatus)
}

export interface PermanenceFacts {
  hasPassword: boolean
  hasExpiry: boolean
  hasStart: boolean
  hasMaxClicks: boolean
  hasRules: boolean
  hasDailyCap?: boolean
}

/** Permanent redirects get cached by browsers and would bypass later gates. */
export function assertStatusCompatible(status: RedirectStatus | null, f: PermanenceFacts): void {
  if (status !== 301 && status !== 308) return
  const reasons: string[] = []
  if (f.hasPassword) reasons.push('a password')
  if (f.hasExpiry) reasons.push('an expiry date')
  if (f.hasStart) reasons.push('a go-live date')
  if (f.hasMaxClicks) reasons.push('a click limit')
  if (f.hasDailyCap) reasons.push('a daily click cap')
  if (f.hasRules) reasons.push('targeting rules')
  if (reasons.length) throw new Error(`Permanent redirects (${status}) cannot be used with ${reasons.join(', ')}`)
}

/** Status actually sent: bots and gated visits keep 307 so nothing sticky is cached. */
export function effectiveRedirectStatus(stored: number | null | undefined, opts: { ruleMatched: boolean; gated: boolean }): RedirectStatus {
  if (opts.ruleMatched || opts.gated) return DEFAULT_REDIRECT_STATUS
  return (REDIRECT_STATUSES as readonly number[]).includes(stored ?? 0) ? (stored as RedirectStatus) : DEFAULT_REDIRECT_STATUS
}
