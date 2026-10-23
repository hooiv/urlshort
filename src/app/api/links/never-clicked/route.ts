import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ANALYTICS_READ_SCOPES, resolveActor } from '@/lib/request-actor'
import { READ_ROLES } from '@/lib/authorization'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { canAdministerFolders } from '@/lib/folders'
import type { AnalyticsScope } from '@/lib/aggregate-analytics'
import { findNeverClickedLinks, parseNeverClickedLimit, parseNeverClickedMinAge } from '@/lib/never-clicked-links'

/**
 * GET /api/links/never-clicked?workspaceId=&limit=50&minAgeDays=7
 * Active links with zero clicks older than minAgeDays, oldest first.
 * Session auth or API key with analytics:read / links:read.
 */
export async function GET(request: NextRequest) {
  try {
    const limit = await rateLimit(request, { name: 'links-never-clicked', limit: 60, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })

    const resolved = await resolveActor(request, ANALYTICS_READ_SCOPES)
    if (!resolved.actor) return NextResponse.json({ error: resolved.error === 'Authentication required' ? 'Unauthorized' : resolved.error }, { status: resolved.status })
    const userId = resolved.actor.userId

    const params = request.nextUrl.searchParams
    const max = parseNeverClickedLimit(params.get('limit'))
    if (max === null) return NextResponse.json({ error: 'limit must be an integer from 1 to 200' }, { status: 400 })
    const minAge = parseNeverClickedMinAge(params.get('minAgeDays'))
    if (minAge === null) return NextResponse.json({ error: 'minAgeDays must be an integer from 0 to 3650' }, { status: 400 })
    const workspaceId = params.get('workspaceId')
    let scope: AnalyticsScope
    if (workspaceId) {
      const membership = await prisma.membership.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { role: true } })
      if (!membership || !READ_ROLES.includes(membership.role)) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
      scope = { kind: 'workspace', workspaceId, viewer: canAdministerFolders(membership.role) ? undefined : { userId } }
    } else {
      scope = { kind: 'user', userId }
    }

    const result = await findNeverClickedLinks(scope, max, minAge)
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, max-age=60' } })
  } catch (error) {
    console.error('Never-clicked links failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
