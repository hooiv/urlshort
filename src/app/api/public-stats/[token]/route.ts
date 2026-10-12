import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { resolveWindow } from '@/lib/aggregate-analytics'
import { getPublicStats } from '@/lib/public-stats'

/** GET /api/public-stats/:token?range=7d|30d|90d|365d — unauthenticated, token is the credential. */
export async function GET(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  const limit = await rateLimit(request, { name: 'public-stats', limit: 120, windowMs: 60_000 })
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })
  let window
  try {
    window = resolveWindow({ range: request.nextUrl.searchParams.get('range') })
  } catch {
    return NextResponse.json({ error: 'Invalid range' }, { status: 400 })
  }
  const stats = await getPublicStats(token, window)
  if (!stats) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(stats, { headers: { 'Cache-Control': 'public, max-age=60', 'X-Robots-Tag': 'noindex, nofollow' } })
}
