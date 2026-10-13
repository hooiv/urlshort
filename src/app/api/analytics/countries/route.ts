import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ANALYTICS_READ_SCOPES, resolveActor } from '@/lib/request-actor'
import { READ_ROLES } from '@/lib/authorization'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { canAdministerFolders } from '@/lib/folders'
import { getCountryPerformance, parseCountryWindow } from '@/lib/country-performance'

/**
 * GET /api/analytics/countries?workspaceId=&days=7|30|90
 * Human clicks per folder vs the previous window. Session auth or API key with analytics:read / links:read.
 */
export async function GET(request: NextRequest) {
  try {
    const limit = await rateLimit(request, { name: 'analytics-countries', limit: 60, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })

    const resolved = await resolveActor(request, ANALYTICS_READ_SCOPES)
    if (!resolved.actor) return NextResponse.json({ error: resolved.error === 'Authentication required' ? 'Unauthorized' : resolved.error }, { status: resolved.status })
    const userId = resolved.actor.userId

    const params = request.nextUrl.searchParams
    const days = parseCountryWindow(params.get('days'))
    if (days === null) return NextResponse.json({ error: 'days must be one of 7, 30, 90' }, { status: 400 })

    const workspaceId = params.get('workspaceId')
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
    const membership = await prisma.membership.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { role: true } })
    if (!membership || !READ_ROLES.includes(membership.role)) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    const viewer = canAdministerFolders(membership.role) ? undefined : { userId }

    const result = await getCountryPerformance(workspaceId, viewer, days)
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, max-age=60' } })
  } catch (error) {
    console.error('Country performance failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
