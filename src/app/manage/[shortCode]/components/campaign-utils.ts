import type { Form, PreviewInput } from '@/app/manage/[shortCode]/components/campaign-types'

/** True only for absolute http(s) URLs. Guards every URL field before it hits an API. */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/** Copy helper with a legacy fallback; resolves false instead of throwing. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const area = document.createElement('textarea')
      area.value = text
      document.body.appendChild(area)
      area.select()
      document.execCommand('copy')
      area.remove()
      return true
    } catch {
      return false
    }
  }
}

export function buildShortUrl(origin: string, shortCode: string): string {
  const base = origin ? `${origin}/${shortCode}` : `/${shortCode}`
  return base
}

export function buildUtmUrl(
  origin: string,
  shortCode: string,
  parts: { source: string; medium: string; campaign: string },
): string {
  const params = new URLSearchParams()
  if (parts.source.trim()) params.set('utm_source', parts.source.trim())
  if (parts.medium.trim()) params.set('utm_medium', parts.medium.trim())
  if (parts.campaign.trim()) params.set('utm_campaign', parts.campaign.trim())
  const query = params.toString()
  const base = buildShortUrl(origin, shortCode)
  return query ? `${base}?${query}` : base
}

/** Convert an ISO timestamp to a `datetime-local` input value in local time. */
export function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}

/**
 * Latest revision whose effectiveAt is at or before `nowMs`.
 * Order-independent: the API returns newest-first today, but callers must not rely on that.
 */
export function findLiveRevision<T extends { effectiveAt: string }>(
  revisions: T[],
  nowMs: number,
): T | undefined {
  let live: T | undefined
  let liveTime = Number.NEGATIVE_INFINITY
  for (const revision of revisions) {
    const time = new Date(revision.effectiveAt).getTime()
    if (Number.isNaN(time) || time > nowMs) continue
    if (time > liveTime) {
      live = revision
      liveTime = time
    }
  }
  return live
}

/**
 * Rollback target: the newest revision strictly older than the live one.
 * Position-based selection (`revisions[1]`) would roll back onto a future
 * scheduled release instead of the true predecessor.
 */
export function findRollbackTarget<T extends { id: string; effectiveAt: string }>(
  revisions: T[],
  liveId: string,
): T | undefined {
  const live = revisions.find((revision) => revision.id === liveId)
  if (!live) return undefined
  const liveTime = new Date(live.effectiveAt).getTime()
  if (Number.isNaN(liveTime)) return undefined
  let target: T | undefined
  let targetTime = Number.NEGATIVE_INFINITY
  for (const revision of revisions) {
    if (revision.id === liveId) continue
    const time = new Date(revision.effectiveAt).getTime()
    if (Number.isNaN(time) || time >= liveTime) continue
    if (time > targetTime) {
      target = revision
      targetTime = time
    }
  }
  return target
}

/**
 * Parse a rule priority/weight textbox. Throws with the same message the
 * API returns. Without this, `Number('')`/`NaN` serializes to `null` and the
 * server silently defaults the field to 100 — the wrong rule order with no error.
 */
export function parseRuleNumber(raw: string, label: 'Priority' | 'Weight', min: number, max: number): number {
  // Blank must throw: Number('') is 0, which would silently promote the rule
  // to the top of the evaluation order instead of surfacing a validation error.
  if (!raw.trim()) throw new Error(`${label} must be ${min}–${max}`)
  const value = Number(raw)
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label} must be ${min}–${max}`)
  }
  return value
}

function parseRuleDate(raw: string, label: string): string | null {
  if (!raw) return null
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) throw new Error(`Enter a valid ${label.toLowerCase()} date`)
  return date.toISOString()
}

/**
 * Validate the rule form and build the exact POST body for `/rules`.
 * Throws a human-readable error instead of sending NaN/invalid payloads.
 */
export function buildRulePayload(form: Form) {
  const name = form.name.trim()
  if (!name) throw new Error('Rule name is required')
  if (!isHttpUrl(form.destinationUrl)) throw new Error('Enter a valid URL')
  const priority = parseRuleNumber(form.priority, 'Priority', 0, 10000)
  const weight = parseRuleNumber(form.weight, 'Weight', 0, 1000)
  const startAt = parseRuleDate(form.startAt, 'Start')
  const endAt = parseRuleDate(form.endAt, 'End')
  if (startAt && endAt && endAt <= startAt) throw new Error('End time must be after start time')
  return {
    name,
    destinationUrl: form.destinationUrl.trim(),
    priority,
    weight,
    countryCodes: form.countryCodes,
    deviceType: form.deviceType || null,
    trafficType: form.trafficType || null,
    aiAgent: form.aiAgent || null,
    os: form.os || null,
    languageCodes: form.languageCodes || null,
    referrerDomain: form.referrerDomain,
    startAt,
    endAt,
  }
}

export type RulePayload = ReturnType<typeof buildRulePayload>

/** Positive-integer click limit, or null to clear. Rejects NaN (serializes to null). */
export function parseMaxClicks(raw: string): number | null {
  if (!raw.trim()) return null
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1) throw new Error('Max clicks must be a positive integer')
  return value
}

/** `datetime-local` value to ISO string, or null to clear. */
export function parseExpirationInput(raw: string): string | null {
  if (!raw) return null
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) throw new Error('Invalid expiration date')
  return date.toISOString()
}

/**
 * Normalize a candidate tag. Returns null when empty/duplicate (no-op),
 * throws when it could never pass server-side normalization.
 */
export function normalizeNewTag(input: string, existing: string[]): string | null {
  const tag = input.trim().toLowerCase()
  if (!tag) return null
  if (existing.includes(tag)) return null
  if (tag.length > 32 || !/^[a-z0-9][a-z0-9-_ ]{0,31}$/.test(tag)) {
    throw new Error('Tags may only contain letters, numbers, spaces, dashes, and underscores')
  }
  return tag
}

/** Trim/case-fold simulator inputs; throws with the API's own messages. */
export function buildPreviewPayload(preview: PreviewInput) {
  const country = preview.country.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(country)) throw new Error('Country must be an ISO 2-letter code')
  const language = preview.language.trim().toLowerCase()
  if (!/^[a-z]{2,3}$/.test(language)) throw new Error('Invalid language code')
  const referrerHost = preview.referrerHost.trim().toLowerCase()
  if (referrerHost && !/^[a-z0-9.-]+$/.test(referrerHost)) throw new Error('Invalid referrer host')
  return {
    country,
    deviceType: preview.deviceType,
    os: preview.os,
    language,
    trafficType: preview.trafficType,
    aiAgent: preview.aiAgent.trim(),
    referrerHost,
  }
}
