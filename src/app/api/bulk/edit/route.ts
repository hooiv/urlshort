import { NextRequest, NextResponse } from 'next/server'
import { LINK_WRITE_SCOPES, resolveActor } from '@/lib/request-actor'
import { rateLimit } from '@/lib/rate-limit'
import { applyBulkEdit, bulkEditSchema } from '@/lib/bulk-edit'
import { dispatchWebhooksForUrls } from '@/lib/webhooks'

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

  const result = await applyBulkEdit(resolved.actor.userId, body.data)
  if (!result.ok) return NextResponse.json({ error: result.error, failures: result.failures }, { status: result.status })

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
  return NextResponse.json({ updated: result.updated.length, unchanged: result.unchanged, links: result.updated })
}
