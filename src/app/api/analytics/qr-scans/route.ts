import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ANALYTICS_READ_SCOPES, resolveActor } from '@/lib/request-actor'
import { READ_ROLES } from '@/lib/authorization'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { canAdministerFolders } from '@/lib/folders'
import type { AnalyticsScope } from '@/lib/aggregate-analytics'
import { getQrScanReport, parseQrDays } from '@/lib/qr-scans'

/**
 * GET /api/analytics/qr-scans?workspaceId=&days=1|7|14|30|90
 * QR scan totals (utm_medium=qr), daily series and top scanned links.
 * Session auth or API key with analytics:read / links:read.
 */
export async function GET(request: NextRequest) {
  try {
    const limit = await rateLimit(request, { name: 'analytics-qr-scans', limit: 60, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })

    const resolved = await resolveActor(request, ANALYTICS_READ_SCOPES)
    if (!resolved.actor) return NextResponse.json({ error: resolved.error === 'Authentication required' ? 'Unauthorized' : resolved.error }, { status: resolved.status })
    const userId = resolved.actor.userId

    const params = request.nextUrl.searchParams
    const days = parseQrDays(params.get('days'))
    if (days === null) return NextResponse.json({ error: 'days must be one of 1, 7, 14, 30, 90' }, { status: 400 })

    const workspaceId = params.get('workspaceId')
    let scope: AnalyticsScope
    if (workspaceId) {
      const membership = await prisma.membership.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { role: true } })
      if (!membership || !READ_ROLES.includes(membership.role)) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
      scope = { kind: 'workspace', workspaceId, viewer: canAdministerFolders(membership.role) ? undefined : { userId } }
    } else {
      scope = { kind: 'user', userId }
    }

    const result = await getQrScanReport(scope, days)
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, max-age=60' } })
  } catch (error) {
    console.error('Traffic quality failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
