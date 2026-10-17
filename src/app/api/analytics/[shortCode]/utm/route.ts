import { NextRequest, NextResponse } from 'next/server'
import { getManageableUrl, READ_ROLES } from '@/lib/authorization'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { maybeCsvResponse } from '@/lib/analytics-csv'
import { getUtmBreakdown, parseUtmDays, parseUtmDimension, parseUtmLimit } from '@/lib/utm-breakdown'

/**
 * GET /api/analytics/:shortCode/utm?by=source|medium|campaign|term|content&days=30&limit=10&format=csv
 * Human clicks grouped by one UTM dimension. Session auth or API key with analytics:read / links:read.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  try {
    const limit = await rateLimit(request, { name: 'analytics-utm', limit: 60, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })

    const { shortCode } = await context.params
    const access = await getManageableUrl(request, shortCode, READ_ROLES)
    if (!access.url) return NextResponse.json({ error: access.error }, { status: access.status })

    const params = request.nextUrl.searchParams
    const dimension = parseUtmDimension(params.get('by'))
    if (!dimension) return NextResponse.json({ error: 'by must be one of source, medium, campaign, term, content' }, { status: 400 })
    const days = parseUtmDays(params.get('days'))
    if (days === null) return NextResponse.json({ error: 'days must be an integer from 1 to 365' }, { status: 400 })
    const max = parseUtmLimit(params.get('limit'))
    if (max === null) return NextResponse.json({ error: 'limit must be an integer from 1 to 50' }, { status: 400 })

    const result = await getUtmBreakdown(access.url.id, dimension, days, max)
    const csv = maybeCsvResponse(params.get('format'), result.rows as unknown as Record<string, unknown>[], `utm-${dimension}-${shortCode}`)
    if (csv) return csv
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, max-age=60' } })
  } catch (error) {
    console.error('UTM breakdown failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
