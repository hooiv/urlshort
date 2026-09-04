import type { TrafficKind } from '@/lib/smart-routing'

/**
 * Pure redirect-policy helpers for the `/{shortCode}` hot path.
 *
 * Everything here is synchronous and side-effect free so it stays unit
 * testable and can never add latency to a redirect. I/O (cache, database,
 * queue) lives in the route handler and in `link-cache` / `campaigns`.
 */

/** Upper bound on forwarded query params — prevents oversized-URL DoS. */
export const MAX_FORWARDED_PARAMS = 50

/**
 * Merge incoming query params into the destination URL so campaign context
 * (utm_*, gclid, fbclid, …) survives the redirect. Params already present on
 * the destination win — the link owner's explicit values take precedence.
 *
 * Throws when `destination` is not a valid absolute URL. Callers treat that
 * as a broken link (404), never as an infrastructure failure (503).
 */
export function forwardQueryParams(destination: string, incoming: URLSearchParams): string {
  const url = new URL(destination)
  let forwarded = 0
  for (const [key, value] of incoming) {
    if (forwarded >= MAX_FORWARDED_PARAMS) break
    if (!url.searchParams.has(key)) {
      url.searchParams.set(key, value)
      forwarded += 1
    }
  }
  return url.toString()
}

/** Destination precedence: smart rule > campaign variant > scheduled revision > link default. */
export function resolveDestination(parts: {
  ruleUrl?: string | null
  campaignUrl?: string | null
  revisionUrl?: string | null
  fallbackUrl: string
}): string {
  return parts.ruleUrl || parts.campaignUrl || parts.revisionUrl || parts.fallbackUrl
}

/**
 * Only human (and AI-agent) visits consume billable quota. Automated
 * crawlers, link unfurlers and preview bots are still logged for analytics
 * transparency, but they must never burn a tenant's click budget or trigger
 * a max-clicks self-destruct — a shared link would otherwise die before any
 * human arrives.
 */
export function isBillableTraffic(trafficType: TrafficKind): boolean {
  return trafficType !== 'bot'
}

/** HTML-escape for attribute and text interpolation. Never use for JS strings. */
export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Escape a value for interpolation inside a `<script>` string literal.
 * HTML-escaping is wrong there (`&quot;` would navigate to a literal
 * `&quot;` URL); a JSON string literal is both valid JS and injection-safe.
 * `<` is unicode-escaped so a destination containing `</script>` can never
 * break out of the script element.
 */
export function jsString(value: string): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}
