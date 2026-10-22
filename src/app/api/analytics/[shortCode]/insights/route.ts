import { NextRequest, NextResponse } from 'next/server'
import { getManageableUrl, READ_ROLES } from '@/lib/authorization'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { getLinkInsights, parseInsightDays } from '@/lib/link-insights'

/**
 * GET /api/analytics/:shortCode/insights?days=30
 * Rule-based plain-language findings (momentum, bursts, concentration, bots).
 * Session auth or an API key with analytics:read / links:read.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  try {
    const limit = await rateLimit(request, { name: 'analytics-insights', limit: 60, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })
    const { shortCode } = await context.params
    const access = await getManageableUrl(request, shortCode, READ_ROLES)
    if (!access.url) return NextResponse.json({ error: access.error }, { status: access.status })
    const days = parseInsightDays(request.nextUrl.searchParams.get('days'))
    if (days === null) return NextResponse.json({ error: 'days must be an integer from 7 to 90' }, { status: 400 })
    const result = await getLinkInsights(access.url.id, days)
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, max-age=60' } })
  } catch (error) {
    console.error('Link insights failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
