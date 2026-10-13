import { NextRequest, NextResponse } from 'next/server'
import { LINK_READ_SCOPES, resolveActor } from '@/lib/request-actor'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { listTrash, TRASH_RETENTION_DAYS } from '@/lib/link-trash'

/** GET /api/links/trash — deleted links still inside the 30-day restore window. */
export async function GET(request: NextRequest) {
  const resolved = await resolveActor(request, LINK_READ_SCOPES)
  if (!resolved.actor) return NextResponse.json({ error: resolved.error }, { status: resolved.status })
  const limit = await rateLimit(request, { name: 'links-trash', limit: 60, windowMs: 60_000, identifier: resolved.actor.userId })
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })
  const links = await listTrash(resolved.actor.userId)
  return NextResponse.json({ retentionDays: TRASH_RETENTION_DAYS, links }, { headers: { 'Cache-Control': 'private, no-store' } })
}
