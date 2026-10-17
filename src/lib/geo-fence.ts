/**
 * Per-link geo-fencing: restrict a link to (allow) or block (deny) visitor
 * countries. Pure decision logic; callers supply the ISO-3166 alpha-2 country
 * resolved from the CDN header.
 */

export type GeoFenceMode = 'allow' | 'deny'

export interface GeoFence {
  mode: GeoFenceMode
  countries: string[]
  /** Whether a visitor with an unknown country is let through. Default: true for deny, false for allow. */
  allowUnknown?: boolean
}

const COUNTRY_RE = /^[A-Z]{2}$/

export type GeoFenceParse =
  | { ok: true; fence: GeoFence | null }
  | { ok: false; error: string }

/** Validates untrusted input. `null`/`undefined` clears the fence. */
export function parseGeoFence(input: unknown): GeoFenceParse {
  if (input === null || input === undefined) return { ok: true, fence: null }
  if (typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'geoFence must be an object or null' }
  const raw = input as Record<string, unknown>
  if (raw.mode !== 'allow' && raw.mode !== 'deny') return { ok: false, error: 'geoFence.mode must be "allow" or "deny"' }
  if (!Array.isArray(raw.countries)) return { ok: false, error: 'geoFence.countries must be an array' }
  if (raw.countries.length > 250) return { ok: false, error: 'geoFence.countries has too many entries' }
  const seen = new Set<string>()
  for (const c of raw.countries) {
    if (typeof c !== 'string') return { ok: false, error: 'geoFence.countries must contain strings' }
    const code = c.trim().toUpperCase()
    if (!COUNTRY_RE.test(code)) return { ok: false, error: `Invalid country code: ${String(c).slice(0, 8)}` }
    seen.add(code)
  }
  if (seen.size === 0) {
    if (raw.mode === 'allow') return { ok: false, error: 'An allow-list needs at least one country' }
    return { ok: true, fence: null }
  }
  if (raw.allowUnknown !== undefined && typeof raw.allowUnknown !== 'boolean') return { ok: false, error: 'geoFence.allowUnknown must be a boolean' }
  const fence: GeoFence = { mode: raw.mode, countries: [...seen].sort() }
  if (raw.allowUnknown !== undefined) fence.allowUnknown = raw.allowUnknown
  return { ok: true, fence }
}

/** True when the visitor may follow the link. */
export function isCountryAllowed(fence: GeoFence | null | undefined, country: string | null | undefined): boolean {
  if (!fence || fence.countries.length === 0) return true
  const code = country?.trim().toUpperCase()
  if (!code || !COUNTRY_RE.test(code) || code === 'XX' || code === 'T1') {
    return fence.allowUnknown ?? fence.mode === 'deny'
  }
  const listed = fence.countries.includes(code)
  return fence.mode === 'allow' ? listed : !listed
}
