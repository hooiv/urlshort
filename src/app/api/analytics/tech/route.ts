import { NextRequest, NextResponse } from 'next/server'
import { maybeCsvResponse } from '@/lib/analytics-csv'
import { prisma } from '@/lib/prisma'
import { ANALYTICS_READ_SCOPES, resolveActor } from '@/lib/request-actor'
import { READ_ROLES } from '@/lib/authorization'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { canAdministerFolders } from '@/lib/folders'
import { getTechPerformance, parseTechDimension, parseTechWindow } from '@/lib/tech-performance'

/**
 * GET /api/analytics/tech?workspaceId=&dimension=browser|os|device&days=7|30|90[&format=csv]
 * Human clicks per browser, OS or device vs the previous window. Session auth or API key with analytics:read / links:read.
 */
export async function GET(request: NextRequest) {
  try {
    const limit = await rateLimit(request, { name: 'analytics-tech', limit: 60, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })

    const resolved = await resolveActor(request, ANALYTICS_READ_SCOPES)
    if (!resolved.actor) return NextResponse.json({ error: resolved.error === 'Authentication required' ? 'Unauthorized' : resolved.error }, { status: resolved.status })
    const userId = resolved.actor.userId

    const params = request.nextUrl.searchParams
    const days = parseTechWindow(params.get('days'))
    if (days === null) return NextResponse.json({ error: 'days must be one of 7, 30, 90' }, { status: 400 })

    const dimension = parseTechDimension(params.get('dimension'))
    if (dimension === null) return NextResponse.json({ error: 'dimension must be one of browser, os, device' }, { status: 400 })

    const workspaceId = params.get('workspaceId')
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
    const membership = await prisma.membership.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { role: true } })
    if (!membership || !READ_ROLES.includes(membership.role)) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    const viewer = canAdministerFolders(membership.role) ? undefined : { userId }

    const result = await getTechPerformance(workspaceId, viewer, dimension, days)
    const csv = maybeCsvResponse(params.get('format'), result.rows as unknown as Record<string, unknown>[], 'tech-' + dimension + '-' + days + 'd')
    if (csv) return csv
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, max-age=60' } })
  } catch (error) {
    console.error('Tech performance failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
