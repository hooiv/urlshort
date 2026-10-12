import { NextRequest, NextResponse } from 'next/server'
import { LINK_READ_SCOPES, resolveActor } from '@/lib/request-actor'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { listExpiringLinks, parseHorizonDays } from '@/lib/expiring-links'

/**
 * GET /api/links/expiring?days=7
 * Links expiring within `days` (1-90) or ≥80% through their click cap.
 * Session auth or API key with links:read / links:write.
 */
export async function GET(request: NextRequest) {
  const resolved = await resolveActor(request, LINK_READ_SCOPES)
  if (!resolved.actor) return NextResponse.json({ error: resolved.error }, { status: resolved.status })
  const limit = await rateLimit(request, { name: 'links-expiring', limit: 60, windowMs: 60_000, identifier: resolved.actor.userId })
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })
  const days = parseHorizonDays(request.nextUrl.searchParams.get('days'))
  if (days === null) return NextResponse.json({ error: 'days must be an integer from 1 to 90' }, { status: 400 })
  const links = await listExpiringLinks(resolved.actor.userId, days)
  return NextResponse.json({ days, links }, { headers: { 'Cache-Control': 'private, max-age=30' } })
}
