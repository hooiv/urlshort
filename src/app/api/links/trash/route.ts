import { NextRequest, NextResponse } from 'next/server'
import { LINK_READ_SCOPES, LINK_WRITE_SCOPES, resolveActor } from '@/lib/request-actor'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { recordAudit } from '@/lib/audit'
import { emptyTrash, listTrash, restoreAllTrash, TRASH_RETENTION_DAYS } from '@/lib/link-trash'

/** GET /api/links/trash — deleted links still inside the 30-day restore window. */
export async function GET(request: NextRequest) {
  const resolved = await resolveActor(request, LINK_READ_SCOPES)
  if (!resolved.actor) return NextResponse.json({ error: resolved.error }, { status: resolved.status })
  const limit = await rateLimit(request, { name: 'links-trash', limit: 60, windowMs: 60_000, identifier: resolved.actor.userId })
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })
  const links = await listTrash(resolved.actor.userId)
  return NextResponse.json({ retentionDays: TRASH_RETENTION_DAYS, links }, { headers: { 'Cache-Control': 'private, no-store' } })
}

/** POST /api/links/trash {action:"restore_all"|"empty"} — bulk restore or permanently erase the caller's own trash. Needs links:write. */
export async function POST(request: NextRequest) {
  const resolved = await resolveActor(request, LINK_WRITE_SCOPES)
  if (!resolved.actor) return NextResponse.json({ error: resolved.error }, { status: resolved.status })
  const limit = await rateLimit(request, { name: 'links-trash-bulk', limit: 10, windowMs: 60_000, identifier: resolved.actor.userId })
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })
  const body = await request.json().catch(() => null) as { action?: unknown } | null
  if (body?.action !== 'restore_all' && body?.action !== 'empty') {
    return NextResponse.json({ error: 'action must be "restore_all" or "empty"' }, { status: 400 })
  }
  const userId = resolved.actor.userId
  const count = body.action === 'restore_all' ? await restoreAllTrash(userId) : await emptyTrash(userId)
  await recordAudit(request, { action: body.action === 'restore_all' ? 'link.restore_all' : 'link.trash_empty', resourceType: 'url', after: { count } })
  return NextResponse.json({ action: body.action, count })
}
