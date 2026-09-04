/**
 * Pure auth-header logic for the docs playground.
 *
 * Most endpoints accept `x-api-key`; the health probe only accepts the
 * per-link management token (`x-management-token` / Bearer). Centralizing
 * this keeps samples, snippets, and live requests consistent with the
 * actual route handlers.
 */

import type { EndpointSpec } from './apiCatalog'

export const API_KEY_PLACEHOLDER = 'qlk_live_your_api_key'

/** Trimmed credential, or a placeholder when the field is empty. */
export function resolveCredential(apiKey: string): string {
  return apiKey.trim() || API_KEY_PLACEHOLDER
}

/** Header name the endpoint authenticates with. */
export function authHeaderName(spec: EndpointSpec): string {
  return spec.auth === 'managementToken' ? 'x-management-token' : 'x-api-key'
}

/**
 * Headers for live playground requests. The credential header is omitted
 * when empty so unauthenticated behavior can be explored; `Content-Type`
 * is only sent for methods that carry a body.
 */
export function buildAuthHeaders(
  spec: EndpointSpec,
  apiKey: string,
  opts?: { includeContentType?: boolean },
): Record<string, string> {
  const headers: Record<string, string> = {}
  if (opts?.includeContentType) headers['Content-Type'] = 'application/json'
  if (apiKey.trim()) headers[authHeaderName(spec)] = apiKey.trim()
  return headers
}
