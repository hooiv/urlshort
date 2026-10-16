import { maybeCsvResponse } from '@/lib/analytics-csv'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ANALYTICS_READ_SCOPES, resolveActor } from '@/lib/request-actor'
import { READ_ROLES } from '@/lib/authorization'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { canAdministerFolders } from '@/lib/folders'
import type { AnalyticsScope } from '@/lib/aggregate-analytics'
import { getClickSpikes, parseSpikeWindow, parseSpikeLimit } from '@/lib/click-spikes'

/**
 * GET /api/analytics/spikes?workspaceId=&windowHours=6|24|72&limit=25&format=csv
 * Links whose recent human clicks run well above their 14-day baseline. Session auth or API key with analytics:read / links:read.
 */
export async function GET(request: NextRequest) {
  try {
    const limit = await rateLimit(request, { name: 'analytics-spikes', limit: 60, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })

    const resolved = await resolveActor(request, ANALYTICS_READ_SCOPES)
    if (!resolved.actor) return NextResponse.json({ error: resolved.error === 'Authentication required' ? 'Unauthorized' : resolved.error }, { status: resolved.status })
    const userId = resolved.actor.userId

    const params = request.nextUrl.searchParams
    const windowHours = parseSpikeWindow(params.get('windowHours'))
    if (windowHours === null) return NextResponse.json({ error: 'windowHours must be one of 6, 24, 72' }, { status: 400 })
    const max = parseSpikeLimit(params.get('limit'))
    if (max === null) return NextResponse.json({ error: 'limit must be an integer from 1 to 100' }, { status: 400 })

    const workspaceId = params.get('workspaceId')
    let scope: AnalyticsScope
    if (workspaceId) {
      const membership = await prisma.membership.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { role: true } })
      if (!membership || !READ_ROLES.includes(membership.role)) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
      scope = { kind: 'workspace', workspaceId, viewer: canAdministerFolders(membership.role) ? undefined : { userId } }
    } else {
      scope = { kind: 'user', userId }
    }

    const result = await getClickSpikes(scope, { windowHours, limit: max })
    const csv = maybeCsvResponse(params.get('format'), result.spikes as unknown as Record<string, unknown>[], 'spikes-' + windowHours + 'h')
    if (csv) return csv
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, max-age=60' } })
  } catch (error) {
    console.error('Click spikes failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
