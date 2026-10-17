import { NextRequest, NextResponse } from 'next/server'
import { maybeCsvResponse } from '@/lib/analytics-csv'
import { getManageableUrl, READ_ROLES } from '@/lib/authorization'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { getChannelBreakdown, parseChannelDays } from '@/lib/referrer-channels'

/**
 * GET /api/analytics/:shortCode/channels?days=30[&format=csv]
 * Human clicks grouped into traffic channels (search, social, email, messaging, other, direct).
 * Session auth or API key with analytics:read / links:read.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  try {
    const limit = await rateLimit(request, { name: 'analytics-channels', limit: 60, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })

    const { shortCode } = await context.params
    const access = await getManageableUrl(request, shortCode, READ_ROLES)
    if (!access.url) return NextResponse.json({ error: access.error }, { status: access.status })

    const days = parseChannelDays(request.nextUrl.searchParams.get('days'))
    if (days === null) return NextResponse.json({ error: 'days must be an integer from 1 to 365' }, { status: 400 })

    const result = await getChannelBreakdown(access.url.id, days)
    const csv = maybeCsvResponse(request.nextUrl.searchParams.get('format'), result.channels.map((c) => ({ channel: c.channel, clicks: c.clicks, share: c.share, topHosts: c.topHosts.map((h) => h.host + ':' + h.clicks).join(' ') })), 'channels-' + shortCode + '-' + days + 'd')
    if (csv) return csv
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, max-age=60' } })
  } catch (error) {
    console.error('Channel breakdown failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
