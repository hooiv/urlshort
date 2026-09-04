import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

export function hashIdempotencyKey(key: string): string { return createHash('sha256').update(key).digest('hex') }
export function requestHash(body: unknown): string { return createHash('sha256').update(JSON.stringify(body ?? null)).digest('hex') }

export async function getIdempotentResponse(request: NextRequest, workspaceId: string, body: unknown) {
  const key = request.headers.get('idempotency-key')?.trim()
  if (!key) return null
  if (key.length < 8 || key.length > 255) throw new Error('Invalid Idempotency-Key')
  const keyHash = hashIdempotencyKey(key)
  const existing = await prisma.idempotencyKey.findUnique({ where: { workspaceId_keyHash: { workspaceId, keyHash } } })
  if (!existing || existing.expiresAt <= new Date()) return { keyHash, requestHash: requestHash(body), existing: null }
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
