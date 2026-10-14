import { NextRequest, NextResponse } from 'next/server'
import { LINK_WRITE_SCOPES, resolveActor } from '@/lib/request-actor'
import { rateLimit } from '@/lib/rate-limit'
import { applyBulkEdit, bulkEditSchema } from '@/lib/bulk-edit'
import { dispatchWebhooksForUrls } from '@/lib/webhooks'
import { prisma } from '@/lib/prisma'
import { getIdempotentResponse, storeIdempotentResponse } from '@/lib/idempotency'

/**
 * Bulk edit: apply tags / folder / expiry / archive / UTM changes to up to
 * 500 links in one transaction. Either every link is updated or none is, and
 * each changed link gets its own audit event with before/after values.
 */
export async function PATCH(request: NextRequest) {
  const resolved = await resolveActor(request, LINK_WRITE_SCOPES)
  if (!resolved.actor) return NextResponse.json({ error: resolved.error }, { status: resolved.status })
  const limit = await rateLimit(request, { name: 'bulk-edit', limit: 20, windowMs: 60_000, identifier: resolved.actor.userId })
  if (!limit.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const body = bulkEditSchema.safeParse(await request.json().catch(() => ({})))
  if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message || 'Invalid request' }, { status: 400 })

  // Idempotency-Key: a retried request after a network drop replays the stored
  // response instead of re-applying (and re-auditing) the same edit. Keys are
  // scoped to the caller's primary workspace.
  let idem: Awaited<ReturnType<typeof getIdempotentResponse>> = null
  let idemWorkspaceId: string | null = null
  if (!body.data.dryRun && request.headers.get('idempotency-key')) {
    const membership = await prisma.membership.findFirst({ where: { userId: resolved.actor.userId }, orderBy: { createdAt: 'asc' }, select: { workspaceId: true } })
    if (membership) {
      idemWorkspaceId = membership.workspaceId
      try {
        idem = await getIdempotentResponse(request, membership.workspaceId, body.data)
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid Idempotency-Key' }, { status: 400 })
      }
      if (idem?.existing) return new NextResponse(idem.existing.responseJson, { status: idem.existing.responseStatus, headers: { 'Content-Type': 'application/json', 'Idempotent-Replay': 'true' } })
    }
  }

  const result = await applyBulkEdit(resolved.actor.userId, body.data)
  if (!result.ok) return NextResponse.json({ error: result.error, failures: result.failures }, { status: result.status })

  if (result.dryRun) {
    return NextResponse.json({ dryRun: true, wouldUpdate: result.updated.length, unchanged: result.unchanged, changes: result.audit.map((a) => ({ ...a, shortCode: result.updated.find((u) => u.id === a.id)?.shortCode })) })
  }

  if (body.data.changes.utm || body.data.changes.utmTemplateId) {
    try {
      await dispatchWebhooksForUrls('link.updated', result.updated.map((l) => ({
        urlId: l.id,
        payload: { id: l.id, shortCode: l.shortCode, occurredAt: new Date().toISOString() },
      })))
    } catch (error) {
      console.error('Bulk edit webhook dispatch failed:', error)
    }
  }
  const payload = { updated: result.updated.length, unchanged: result.unchanged, links: result.updated }
  if (idem && idemWorkspaceId) {
    await storeIdempotentResponse({ workspaceId: idemWorkspaceId, keyHash: idem.keyHash, requestHash: idem.requestHash, method: request.method, path: request.nextUrl.pathname, status: 200, body: payload }).catch((e) => console.error('Idempotency store failed:', e))
  }
  return NextResponse.json(payload)
}
