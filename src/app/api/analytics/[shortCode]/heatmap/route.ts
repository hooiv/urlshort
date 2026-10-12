import { NextRequest, NextResponse } from 'next/server'
import { getManageableUrl, READ_ROLES } from '@/lib/authorization'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { getClickHeatmap, isValidTimezone, parseHeatmapDays } from '@/lib/click-heatmap'

/**
 * GET /api/analytics/:shortCode/heatmap?tz=Asia/Kolkata&days=30
 * Human clicks by weekday × hour in the given IANA timezone (default UTC).
 * Accepts session auth or an API key with analytics:read / links:read.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  try {
    const limit = await rateLimit(request, { name: 'analytics-heatmap', limit: 60, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })

    const { shortCode } = await context.params
    const access = await getManageableUrl(request, shortCode, READ_ROLES)
    if (!access.url) return NextResponse.json({ error: access.error }, { status: access.status })

    const params = request.nextUrl.searchParams
    const timezone = params.get('tz') || 'UTC'
    if (!isValidTimezone(timezone)) return NextResponse.json({ error: 'Invalid timezone' }, { status: 400 })
    const days = parseHeatmapDays(params.get('days'))
    if (days === null) return NextResponse.json({ error: 'days must be an integer from 1 to 90' }, { status: 400 })

    const heatmap = await getClickHeatmap(access.url.id, timezone, days)
    return NextResponse.json(heatmap, { headers: { 'Cache-Control': 'private, max-age=60' } })
  } catch (error) {
    console.error('Click heatmap failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
