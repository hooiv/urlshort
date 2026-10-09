import type { NextRequest } from 'next/server'
import { getCurrentUser } from './auth'
import { authenticateApiKey, extractApiKey, hasAnyApiScope, type ApiKeyAuth } from './api-keys'

/**
 * Who is making this request: a signed-in browser session or an API key.
 *
 * API keys act as their owner but only within their scopes. Scope names are
 * the ones keys are issued with (`links:read`, `links:write`,
 * `analytics:read`, …); `*` grants everything.
 */
export type Actor =
  | { kind: 'session'; userId: string }
  | { kind: 'api_key'; userId: string; apiKey: ApiKeyAuth }

export type ActorResult = { actor: Actor } | { actor: null; status: 401 | 403; error: string }

export const LINK_READ_SCOPES = ['links:read', 'links:write']
export const LINK_WRITE_SCOPES = ['links:write']
export const ANALYTICS_READ_SCOPES = ['analytics:read', 'links:read', 'links:write']

export async function resolveActor(request: NextRequest, scopes: string[]): Promise<ActorResult> {
  // An explicit API key wins: a script sending a key must never silently fall
  // back to whatever cookie happens to be present (or vice versa).
  if (extractApiKey(request)) {
    const apiKey = await authenticateApiKey(request)
    if (!apiKey) return { actor: null, status: 401, error: 'Invalid or revoked API key' }
    if (!hasAnyApiScope(apiKey, scopes)) return { actor: null, status: 403, error: `API key needs one of these scopes: ${scopes.join(', ')}` }
    return { actor: { kind: 'api_key', userId: apiKey.userId, apiKey } }
  }
  const user = await getCurrentUser(request)
  if (!user) return { actor: null, status: 401, error: 'Authentication required' }
  return { actor: { kind: 'session', userId: user.id } }
}
