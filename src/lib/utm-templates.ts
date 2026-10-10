/**
 * Workspace UTM templates: a named set of utm_* values applied to a
 * destination URL. Existing utm_* params on the destination always win, so a
 * template never silently overwrites a hand-tagged link.
 */
export const UTM_KEYS = ['source', 'medium', 'campaign', 'term', 'content'] as const
export type UtmKey = (typeof UTM_KEYS)[number]
export type UtmValues = Partial<Record<UtmKey, string | null>>

const MAX_VALUE = 120

/** Lowercase, trim, collapse whitespace to "-"; empty becomes null. Rejects control characters and over-long values. */
export function normalizeUtmValue(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const v = raw.trim().replace(/\s+/g, '-')
  if (!v) return null
  if (/[\x00-\x1f\x7f]/.test(v)) throw new Error('UTM values cannot contain control characters')
  if (v.length > MAX_VALUE) throw new Error(`UTM values can be at most ${MAX_VALUE} characters`)
  return v.toLowerCase()
}

export function normalizeUtmTemplateName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, ' ')
  if (!name) throw new Error('Template name is required')
  if (name.length > 80) throw new Error('Template name can be at most 80 characters')
  return name
}

export function normalizeUtmValues(values: UtmValues): Record<UtmKey, string | null> {
  const out = {} as Record<UtmKey, string | null>
  for (const k of UTM_KEYS) out[k] = normalizeUtmValue(values[k])
  if (!UTM_KEYS.some((k) => out[k])) throw new Error('A template needs at least one UTM value')
  return out
}

/** Appends the template's values to `url`, keeping any utm_* already present. Returns the URL string unchanged when it is not http(s). */
export function applyUtmTemplate(url: string, values: UtmValues): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return url
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return url
  for (const k of UTM_KEYS) {
    const v = values[k]
    if (v && !parsed.searchParams.has(`utm_${k}`)) parsed.searchParams.set(`utm_${k}`, v)
  }
  return parsed.toString()
}
