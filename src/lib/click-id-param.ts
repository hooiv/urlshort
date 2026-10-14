/**
 * Click-ID passthrough: appends the click's unique id to the destination as a
 * query parameter so advertisers / affiliate networks can send it back in a
 * server-to-server postback (the same pattern as Dub's `dub_id`, Bitly's
 * clickid and Voluum's `cid`). Opt-in per link; the parameter name is validated.
 */
export const CLICK_ID_PARAM_MAX = 32
const NAME_RE = /^[A-Za-z][A-Za-z0-9_]*$/
/** Names that would collide with tracking or security-sensitive parameters. */
const RESERVED = new Set(['ql_attribution', 'token', 'access_token', 'password', 'code', 'state', 'redirect', 'redirect_uri', 'callback', 'signature'])

/** Returns the normalized parameter name, or null to disable. Throws on invalid input. */
export function parseClickIdParam(input: unknown): string | null {
  if (input === null || input === undefined || input === '') return null
  if (typeof input !== 'string') throw new Error('clickIdParam must be a string')
  const name = input.trim()
  if (!name) return null
  if (name.length > CLICK_ID_PARAM_MAX) throw new Error(`clickIdParam must be at most ${CLICK_ID_PARAM_MAX} characters`)
  if (!NAME_RE.test(name)) throw new Error('clickIdParam must start with a letter and contain only letters, digits and underscores')
  if (RESERVED.has(name.toLowerCase())) throw new Error(`clickIdParam "${name}" is reserved`)
  return name
}

/**
 * Sets `?param=<clickId>` on the destination, replacing any existing value for
 * that name (a stale id from a copied URL must never survive). The hash and all
 * other params are preserved. Non-http(s) or unparsable destinations pass through.
 */
export function appendClickId(destination: string, param: string | null | undefined, clickId: string): string {
  if (!param) return destination
  let url: URL
  try { url = new URL(destination) } catch { return destination }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return destination
  url.searchParams.set(param, clickId)
  return url.toString()
}
