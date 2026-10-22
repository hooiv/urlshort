import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { LINK_WRITE_SCOPES, resolveActor } from '@/lib/request-actor'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { undoBulkEdit } from '@/lib/bulk-edit-undo'

const schema = z.object({ auditEventId: z.string().min(1).max(64), dryRun: z.boolean().optional() })

/** Reverts a bulk edit batch (identified by any of its audit event ids), skipping fields changed since. */
export async function POST(request: NextRequest) {
  const resolved = await resolveActor(request, LINK_WRITE_SCOPES)
  if (!resolved.actor) return NextResponse.json({ error: resolved.error }, { status: resolved.status })
  const limit = await rateLimit(request, { name: 'bulk-edit-undo', limit: 10, windowMs: 60_000, identifier: resolved.actor.userId })
  if (!limit.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429, headers: rateLimitHeaders(limit) })
  const body = schema.safeParse(await request.json().catch(() => ({})))
  if (!body.success) return NextResponse.json({ error: 'auditEventId is required' }, { status: 400 })
  const res = await undoBulkEdit(resolved.actor.userId, body.data.auditEventId, body.data.dryRun)
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })
  return NextResponse.json({ dryRun: res.dryRun, restored: res.restored, skipped: res.skipped })
}
