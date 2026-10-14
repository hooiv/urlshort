import { NextRequest, NextResponse } from 'next/server'
import { LINK_READ_SCOPES, resolveActor } from '@/lib/request-actor'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { traceRedirects } from '@/lib/redirect-trace'

/**
 * GET /api/links/trace?url=https://...
 * Follows the redirect chain hop by hop (SSRF-checked each hop) and reports status, latency, loops and https downgrades.
 */
export async function GET(request: NextRequest) {
  try {
    const limit = await rateLimit(request, { name: 'links-trace', limit: 20, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })
    const resolved = await resolveActor(request, LINK_READ_SCOPES)
    if (!resolved.actor) return NextResponse.json({ error: resolved.error === 'Authentication required' ? 'Unauthorized' : resolved.error }, { status: resolved.status })
    const url = request.nextUrl.searchParams.get('url')
    if (!url || url.length > 2048) return NextResponse.json({ error: 'url is required (max 2048 chars)' }, { status: 400 })
    try {
      return NextResponse.json(await traceRedirects(url), { headers: { 'Cache-Control': 'no-store' } })
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid url' }, { status: 400 })
    }
  } catch (error) {
    console.error('Trace failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
