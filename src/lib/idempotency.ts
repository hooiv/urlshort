import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

/** A claimed-but-unfinished request holds its key this long before a retry may take over. */
export const IDEMPOTENCY_PENDING_TTL_MS = 30_000
export const IDEMPOTENCY_IN_PROGRESS_MESSAGE = 'Idempotency-Key request is still in progress; retry shortly'

const claims = new WeakMap<object, { workspaceId: string; keyHash: string }>()

export function hashIdempotencyKey(key: string): string { return createHash('sha256').update(key).digest('hex') }
export function requestHash(body: unknown): string { return createHash('sha256').update(JSON.stringify(body ?? null)).digest('hex') }

export async function getIdempotentResponse(request: NextRequest, workspaceId: string, body: unknown) {
  const key = request.headers.get('idempotency-key')?.trim()
  if (!key) return null
  if (key.length < 8 || key.length > 255) throw new Error('Invalid Idempotency-Key')
  const keyHash = hashIdempotencyKey(key)
  const existing = await prisma.idempotencyKey.findUnique({ where: { workspaceId_keyHash: { workspaceId, keyHash } } })
  const now = new Date()
  const reqHash = requestHash(body)
  const pendingUntil = new Date(now.getTime() + IDEMPOTENCY_PENDING_TTL_MS)
  // Claim the key before doing the work so two concurrent requests with the
  // same key cannot both run the operation (check-then-act race).
  if (!existing) {
    try {
      await prisma.idempotencyKey.create({ data: { workspaceId, keyHash, method: request.method, path: request.nextUrl.pathname, requestHash: reqHash, responseStatus: 0, responseJson: '', expiresAt: pendingUntil } })
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') throw new Error(IDEMPOTENCY_IN_PROGRESS_MESSAGE)
      throw error
    }
    claims.set(request, { workspaceId, keyHash })
    return { keyHash, requestHash: reqHash, existing: null }
  }
  if (existing.expiresAt <= now) {
    const taken = await prisma.idempotencyKey.updateMany({
      where: { workspaceId, keyHash, expiresAt: { lte: now } },
      data: { method: request.method, path: request.nextUrl.pathname, requestHash: reqHash, responseStatus: 0, responseJson: '', expiresAt: pendingUntil },
    })
    if (taken.count === 0) throw new Error(IDEMPOTENCY_IN_PROGRESS_MESSAGE)
    claims.set(request, { workspaceId, keyHash })
    return { keyHash, requestHash: reqHash, existing: null }
  }
  if (existing.responseStatus === 0) throw new Error(IDEMPOTENCY_IN_PROGRESS_MESSAGE)
  // Keys are bound to one endpoint: replaying the same key string with the
  // same body on a different method/path is a different operation, and
  // returning the stored response would leak another endpoint's payload.
  if (existing.method !== request.method || existing.path !== request.nextUrl.pathname) throw new Error('Idempotency-Key was reused with a different request')
  if (existing.requestHash !== requestHash(body)) throw new Error('Idempotency-Key was reused with a different request')
  return { keyHash, requestHash: existing.requestHash, existing }
}

export async function storeIdempotentResponse(args: { workspaceId: string; keyHash: string; requestHash: string; method: string; path: string; status: number; body: unknown; ttlMs?: number }) {
  return prisma.idempotencyKey.upsert({
    where: { workspaceId_keyHash: { workspaceId: args.workspaceId, keyHash: args.keyHash } },
    create: { workspaceId: args.workspaceId, keyHash: args.keyHash, method: args.method, path: args.path, requestHash: args.requestHash, responseStatus: args.status, responseJson: JSON.stringify(args.body), expiresAt: new Date(Date.now() + (args.ttlMs ?? 24 * 60 * 60 * 1000)) },
    // Refresh the request binding too: after expiry the same key may be
    // legitimately reused with a new body, and a stale requestHash would
    // make every subsequent retry throw a false reuse error.
    update: { method: args.method, path: args.path, requestHash: args.requestHash, responseStatus: args.status, responseJson: JSON.stringify(args.body), expiresAt: new Date(Date.now() + (args.ttlMs ?? 24 * 60 * 60 * 1000)) },
  })
}

/**
 * Release a claim whose operation failed, so the client's retry with the same
 * key runs immediately instead of waiting out the pending TTL. Only removes
 * still-pending rows (responseStatus 0); a stored response is never deleted.
 */
export async function releaseIdempotencyClaim(workspaceId: string, keyHash: string) {
  return prisma.idempotencyKey.deleteMany({ where: { workspaceId, keyHash, responseStatus: 0 } })
}

/**
 * Wrap a route handler so a pending Idempotency-Key claim never outlives a
 * failed request. Whatever the handler returns or throws (400/409/503/500...),
 * a claim that was never completed is released so the client's retry runs
 * at once instead of hitting "still in progress" for the pending TTL. A
 * stored response (status != 0) is never touched.
 */
export function withIdempotencyCleanup<A extends [NextRequest, ...unknown[]], R>(handler: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return async (...args: A) => {
    const request = args[0]
    try {
      return await handler(...args)
    } finally {
      const claim = claims.get(request)
      if (claim) {
        claims.delete(request)
        await releaseIdempotencyClaim(claim.workspaceId, claim.keyHash).catch(() => undefined)
      }
    }
  }
}
