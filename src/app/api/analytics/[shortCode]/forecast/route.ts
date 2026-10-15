import { NextRequest, NextResponse } from 'next/server'
import { getManageableUrl, READ_ROLES } from '@/lib/authorization'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { getClickForecast, parseTarget } from '@/lib/click-forecast'

/**
 * GET /api/analytics/:shortCode/forecast?target=10000
 * Projects human clicks for the next 7 days and the date a click target is reached,
 * from the last 14 complete UTC days. Session auth or API key with analytics:read / links:read.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  try {
    const limit = await rateLimit(request, { name: 'analytics-forecast', limit: 60, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })

    const { shortCode } = await context.params
    const access = await getManageableUrl(request, shortCode, READ_ROLES)
    if (!access.url) return NextResponse.json({ error: access.error }, { status: access.status })

    const target = parseTarget(request.nextUrl.searchParams.get('target'))
    if (target === null) return NextResponse.json({ error: 'target must be an integer from 1 to 1000000000' }, { status: 400 })

    const forecast = await getClickForecast(access.url.id, target)
    return NextResponse.json(forecast, { headers: { 'Cache-Control': 'private, max-age=300' } })
  } catch (error) {
    console.error('Click forecast failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
