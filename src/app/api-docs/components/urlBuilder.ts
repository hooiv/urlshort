/**
 * Pure URL-building logic for the docs playground.
 *
 * Kept separate from React so path/query resolution is unit-testable in the
 * node vitest environment.
 */

import type { EndpointSpec } from './apiCatalog'

/**
 * Resolve `{placeholders}` with user input (URI-encoded) and append
 * non-empty trimmed query params. Mirrors the previous page behavior.
 */
export function buildResolvedPath(
  spec: EndpointSpec,
  pathParamValues: Record<string, string>,
  queryParamValues: Record<string, string>,
): string {
  let resolved = spec.path
  spec.pathParams?.forEach((param) => {
    const raw = pathParamValues[param.name]?.trim() || param.default || `{${param.name}}`
    resolved = resolved.replace(`{${param.name}}`, encodeURIComponent(raw))
  })

  const query = new URLSearchParams()
  Object.entries(queryParamValues).forEach(([key, value]) => {
    if (value && value.trim()) query.set(key, value.trim())
  })
  const queryString = query.toString()
  return queryString ? `${resolved}?${queryString}` : resolved
}
