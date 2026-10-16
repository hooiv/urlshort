import { NextRequest, NextResponse } from 'next/server'
import { getManageableUrl, READ_ROLES } from '@/lib/authorization'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { getLinkFunnel, parseFunnelSteps, parseFunnelWindow, FUNNEL_MAX_STEPS } from '@/lib/conversion-funnel'

/**
 * GET /api/analytics/:shortCode/funnel?steps=lead,sale&days=30
 * Ordered goal funnel: human clicks -> each goal key, strictly click-attributed.
 * Session auth or API key with analytics:read / links:read.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  try {
    const limit = await rateLimit(request, { name: 'analytics-funnel', limit: 60, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })

    const { shortCode } = await context.params
    const access = await getManageableUrl(request, shortCode, READ_ROLES)
    if (!access.url) return NextResponse.json({ error: access.error }, { status: access.status })

    const params = request.nextUrl.searchParams
    const steps = parseFunnelSteps(params.get('steps'))
    if (!steps) return NextResponse.json({ error: `steps must be 1-${FUNNEL_MAX_STEPS} unique goal keys, comma separated` }, { status: 400 })
    const days = parseFunnelWindow(params.get('days'))
    if (days === null) return NextResponse.json({ error: 'days must be one of 7, 30, 90' }, { status: 400 })

    const funnel = await getLinkFunnel(access.url.id, steps, days)
    return NextResponse.json(funnel, { headers: { 'Cache-Control': 'private, max-age=60' } })
  } catch (error) {
    console.error('Conversion funnel failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
