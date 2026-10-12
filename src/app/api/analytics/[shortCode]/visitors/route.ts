import { NextRequest, NextResponse } from 'next/server'
import { getManageableUrl, READ_ROLES } from '@/lib/authorization'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { getVisitorRetention, parseVisitorDays } from '@/lib/visitor-retention'

/**
 * GET /api/analytics/:shortCode/visitors?days=30
 * New vs returning unique visitors (privacy-preserving hash) for the window, plus returning rate.
 * Session auth or API key with analytics:read / links:read.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  try {
    const limit = await rateLimit(request, { name: 'analytics-visitors', limit: 60, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })

    const { shortCode } = await context.params
    const access = await getManageableUrl(request, shortCode, READ_ROLES)
    if (!access.url) return NextResponse.json({ error: access.error }, { status: access.status })

    const days = parseVisitorDays(request.nextUrl.searchParams.get('days'))
    if (days === null) return NextResponse.json({ error: 'days must be an integer from 1 to 365' }, { status: 400 })

    const result = await getVisitorRetention(access.url.id, days)
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, max-age=60' } })
  } catch (error) {
    console.error('Visitor retention failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
