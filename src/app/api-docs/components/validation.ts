/**
 * Pure playground input validation.
 *
 * The playground used to send raw editor text straight to `fetch`, turning
 * typos into opaque server 500s. These validators run before dispatch so
 * mistakes surface inline. Node-testable (no DOM).
 */

import type { EndpointSpec } from './apiCatalog'
import { methodHasBody } from './apiCatalog'

export interface BodyValidation {
  ok: boolean
  error?: string
}

/** Validate the JSON editor text for endpoints that send a payload. */
export function validateJsonBody(bodyText: string, requiresBody: boolean): BodyValidation {
  if (!bodyText.trim()) {
    return requiresBody
      ? { ok: false, error: 'Request body is required for this endpoint.' }
      : { ok: true }
  }
  try {
    JSON.parse(bodyText)
    return { ok: true }
  } catch {
    return { ok: false, error: 'Request body is not valid JSON. Fix the syntax before sending.' }
  }
}

export interface PathValidation {
  ok: boolean
  missing: string[]
}

/** Every `{placeholder}` must resolve to a non-empty segment. */
export function validatePathParams(
  spec: EndpointSpec,
  pathParamValues: Record<string, string>,
): PathValidation {
  const missing = (spec.pathParams ?? [])
    .filter((param) => {
      const value = pathParamValues[param.name]?.trim() || param.default
      return !value
    })
    .map((param) => param.name)
  return { ok: missing.length === 0, missing }
}

/** True when the method carries a JSON payload (re-export for components). */
export function endpointHasBody(spec: EndpointSpec): boolean {
  return methodHasBody(spec.method)
}

/**
 * Safely extract an `error` message from an unknown response payload.
 * The previous page typed the payload as `unknown` and read `.error`
 * directly, which is unsound.
 */
export function getResponseErrorMessage(data: unknown, fallback: string): string {
  if (typeof data === 'object' && data !== null && 'error' in data) {
    const message = (data as { error?: unknown }).error
    if (typeof message === 'string' && message.trim()) return message
  }
  return fallback
}
