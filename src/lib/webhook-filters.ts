import crypto from 'crypto'

/**
 * Which of an owner's links fire a webhook endpoint.
 *  - `all`   every link owned by the endpoint's workspace or user
 *  - `tags`  links carrying at least one tag in `tagFilter`
 *  - `links` links whose id is in `urlIdFilter`
 */
export const WEBHOOK_LINK_SCOPES = ['all', 'tags', 'links'] as const
export type WebhookLinkScope = (typeof WEBHOOK_LINK_SCOPES)[number]

export const MAX_WEBHOOK_TAG_FILTERS = 50
export const MAX_WEBHOOK_LINK_FILTERS = 500

export type EndpointLinkFilter = {
  linkScope: string
  tagFilter: string[]
  urlIdFilter: string[]
}

export type FilterableLink = { id: string; tags: string[] }

/** Tags are matched case-insensitively and whitespace-trimmed, mirroring how link tags are stored. */
export function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase()
}

export function endpointMatchesLink(endpoint: EndpointLinkFilter, link: FilterableLink): boolean {
  switch (endpoint.linkScope) {
    case 'all':
      return true
    case 'tags': {
      if (endpoint.tagFilter.length === 0 || link.tags.length === 0) return false
      const wanted = new Set(endpoint.tagFilter.map(normalizeTag))
      return link.tags.some(tag => wanted.has(normalizeTag(tag)))
    }
    case 'links':
      return endpoint.urlIdFilter.includes(link.id)
    default:
      // Unknown scope (e.g. written by a newer deploy during a rollback):
      // fail closed rather than leaking every click to the endpoint.
      return false
  }
}

export type LinkFilterInput = {
  linkScope?: unknown
  tags?: unknown
  shortCodes?: unknown
}

export type ParsedLinkFilter =
  | { ok: true; linkScope: WebhookLinkScope; tagFilter: string[]; shortCodes: string[] }
  | { ok: false; error: string }

/**
 * Validates the user-facing filter payload. Short codes are returned unresolved;
 * the caller must resolve them to url ids it is authorised to read.
 */
export function parseLinkFilterInput(input: LinkFilterInput): ParsedLinkFilter {
  const scope = input.linkScope ?? 'all'
  if (typeof scope !== 'string' || !(WEBHOOK_LINK_SCOPES as readonly string[]).includes(scope)) {
    return { ok: false, error: `linkScope must be one of: ${WEBHOOK_LINK_SCOPES.join(', ')}` }
  }
  const linkScope = scope as WebhookLinkScope

  const strings = (value: unknown, field: string, max: number, maxLen: number): string[] | string => {
    if (value === undefined || value === null) return []
    if (!Array.isArray(value)) return `${field} must be an array of strings`
    const out = new Set<string>()
    for (const item of value) {
      if (typeof item !== 'string') return `${field} must be an array of strings`
      const trimmed = item.trim()
      if (!trimmed) continue
      if (trimmed.length > maxLen) return `${field} entries must be at most ${maxLen} characters`
      out.add(trimmed)
    }
    if (out.size > max) return `${field} accepts at most ${max} entries`
    return [...out]
  }

  const tags = strings(input.tags, 'tags', MAX_WEBHOOK_TAG_FILTERS, 64)
  if (typeof tags === 'string') return { ok: false, error: tags }
  const shortCodes = strings(input.shortCodes, 'shortCodes', MAX_WEBHOOK_LINK_FILTERS, 128)
  if (typeof shortCodes === 'string') return { ok: false, error: shortCodes }

  if (linkScope === 'tags' && tags.length === 0) return { ok: false, error: 'linkScope "tags" needs at least one tag' }
  if (linkScope === 'links' && shortCodes.length === 0) return { ok: false, error: 'linkScope "links" needs at least one short code' }

  return {
    ok: true,
    linkScope,
    tagFilter: linkScope === 'tags' ? [...new Set(tags.map(normalizeTag))] : [],
    shortCodes: linkScope === 'links' ? shortCodes : [],
  }
}

/* ------------------------------------------------------------------------ */
/* Timestamped signatures (replay protection)                               */
/* ------------------------------------------------------------------------ */

export const WEBHOOK_SIGNATURE_TOLERANCE_SECONDS = 300

/**
 * Stripe/Svix-style signature: `t=<unix seconds>,v1=<hex hmac of "t.payload">`.
 * Binding the timestamp into the MAC lets receivers reject captured deliveries
 * replayed outside the tolerance window, which the legacy body-only signature
 * cannot do.
 */
export function signWebhookPayload(payload: string, secret: string, timestampSeconds: number): string {
  const mac = crypto.createHmac('sha256', secret).update(`${timestampSeconds}.${payload}`).digest('hex')
  return `t=${timestampSeconds},v1=${mac}`
}

export function verifyTimestampedWebhookSignature(
  payload: string,
  secret: string,
  header: string,
  options: { nowSeconds?: number; toleranceSeconds?: number } = {},
): boolean {
  if (!payload || !secret || !header) return false
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000)
  const tolerance = options.toleranceSeconds ?? WEBHOOK_SIGNATURE_TOLERANCE_SECONDS

  let timestamp: number | null = null
  const candidates: string[] = []
  for (const part of header.split(',')) {
    const idx = part.indexOf('=')
    if (idx <= 0) continue
    const key = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    if (key === 't' && /^\d{1,12}$/.test(value)) timestamp = Number(value)
    else if (key === 'v1' && /^[0-9a-f]{64}$/.test(value)) candidates.push(value)
  }
  if (timestamp === null || candidates.length === 0) return false
  if (Math.abs(now - timestamp) > tolerance) return false

  const expected = Buffer.from(
    crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex'),
  )
  // Several v1 entries are allowed so a sender can sign with old + new secret during rotation.
  return candidates.some(candidate => crypto.timingSafeEqual(Buffer.from(candidate), expected))
}
