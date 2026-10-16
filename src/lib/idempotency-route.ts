import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getIdempotentResponse, releaseIdempotencyClaim, storeIdempotentResponse } from '@/lib/idempotency'

type Claim = NonNullable<Awaited<ReturnType<typeof getIdempotentResponse>>>

export interface RouteIdempotency {
  /** Present when the key was already used: return this response verbatim. */
  replay: Response | null
  /** Present when the key is claimed by this request. */
  claim: { workspaceId: string; claim: Claim } | null
  /** Set when the Idempotency-Key header was malformed. */
  invalid: string | null
}

/** Claim an Idempotency-Key for a mutating route, scoped to the actor's primary workspace. */
export async function beginRouteIdempotency(request: NextRequest, actorUserId: string | null, fingerprint: unknown): Promise<RouteIdempotency> {
  const none: RouteIdempotency = { replay: null, claim: null, invalid: null }
  if (!actorUserId || !request.headers.get('idempotency-key')) return none
  const membership = await prisma.membership.findFirst({ where: { userId: actorUserId }, orderBy: { createdAt: 'asc' }, select: { workspaceId: true } })
  if (!membership) return none
  let claim: Awaited<ReturnType<typeof getIdempotentResponse>>
  try {
    claim = await getIdempotentResponse(request, membership.workspaceId, fingerprint)
  } catch (error) {
    return { ...none, invalid: error instanceof Error ? error.message : 'Invalid Idempotency-Key' }
  }
  if (!claim) return none
  if (claim.existing) {
    return { ...none, replay: new Response(claim.existing.responseJson, { status: claim.existing.responseStatus, headers: { 'Content-Type': 'application/json', 'Idempotent-Replay': 'true' } }) }
  }
  return { ...none, claim: { workspaceId: membership.workspaceId, claim } }
}

export async function releaseRouteIdempotency(state: RouteIdempotency): Promise<void> {
  if (state.claim) await releaseIdempotencyClaim(state.claim.workspaceId, state.claim.claim.keyHash).catch(() => undefined)
}

export async function storeRouteIdempotency(request: NextRequest, state: RouteIdempotency, status: number, body: unknown): Promise<void> {
  if (!state.claim) return
  await storeIdempotentResponse({ workspaceId: state.claim.workspaceId, keyHash: state.claim.claim.keyHash, requestHash: state.claim.claim.requestHash, method: request.method, path: request.nextUrl.pathname, status, body }).catch((e) => console.error('Idempotency store failed:', e))
}
