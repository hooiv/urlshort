/**
 * Per-link query-string forwarding policy.
 *  - all (default): every incoming param is merged into the destination.
 *  - none: nothing is forwarded (destination is served exactly as saved).
 *  - allowlist: only listed names (case-insensitive) are forwarded.
 * QuickLink-internal params (ql_*) and credential-looking params are never
 * forwarded under any mode, so a shared short link can't leak tokens.
 */
export const QUERY_FORWARD_MODES = ['all', 'none', 'allowlist'] as const
export type QueryForwardMode = (typeof QUERY_FORWARD_MODES)[number]
export const MAX_ALLOWLIST = 25
const NAME_RE = /^[A-Za-z0-9_.\-\[\]]{1,64}$/
const NEVER_FORWARD = new Set(['password', 'passwd', 'access_token', 'id_token', 'refresh_token', 'api_key', 'apikey', 'secret'])

export interface QueryForwardPolicy { mode: QueryForwardMode; allow: string[] }

/** Validates API input. Throws on bad input; null/undefined mode means default. */
export function parseQueryForwarding(mode: unknown, allow: unknown): QueryForwardPolicy {
  const m = mode === null || mode === undefined || mode === '' ? 'all' : mode
  if (typeof m !== 'string' || !(QUERY_FORWARD_MODES as readonly string[]).includes(m)) {
    throw new Error('queryForwardMode must be one of all, none or allowlist')
  }
  if (m !== 'allowlist') return { mode: m as QueryForwardMode, allow: [] }
  if (!Array.isArray(allow) || allow.length === 0) throw new Error('queryForwardAllow needs at least one parameter name')
  if (allow.length > MAX_ALLOWLIST) throw new Error(`queryForwardAllow accepts at most ${MAX_ALLOWLIST} names`)
  const out = new Set<string>()
  for (const raw of allow) {
    if (typeof raw !== 'string' || !NAME_RE.test(raw.trim())) throw new Error(`Invalid parameter name: ${String(raw).slice(0, 40)}`)
    out.add(raw.trim().toLowerCase())
  }
  return { mode: 'allowlist', allow: [...out] }
}

export function isNeverForwarded(name: string): boolean {
  const n = name.toLowerCase()
  return n.startsWith('ql_') || NEVER_FORWARD.has(n)
}

/** Returns the subset of incoming params the policy lets through. */
export function filterForwardedParams(incoming: URLSearchParams, policy: Partial<QueryForwardPolicy> | null | undefined): URLSearchParams {
  const mode = policy?.mode ?? 'all'
  const out = new URLSearchParams()
  if (mode === 'none') return out
  const allow = new Set((policy?.allow ?? []).map((a) => a.toLowerCase()))
  for (const [k, v] of incoming) {
    if (isNeverForwarded(k)) continue
    if (mode === 'allowlist' && !allow.has(k.toLowerCase())) continue
    out.append(k, v)
  }
  return out
}
