import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ANALYTICS_READ_SCOPES, resolveActor } from '@/lib/request-actor'
import { READ_ROLES } from '@/lib/authorization'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { canAdministerFolders } from '@/lib/folders'
import type { AnalyticsScope } from '@/lib/aggregate-analytics'
import { listLinksNeedingAttention, parseAttentionIssue, parseAttentionLimit, ATTENTION_ISSUES } from '@/lib/link-attention'

/**
 * GET /api/links/attention?issue=down|degraded|expired|expiringSoon|scheduled|clickLimitReached|flaggedRisky|untagged&workspaceId=&limit=25
 * The links behind each /api/links/hygiene counter, most-clicked first.
 * Session auth or API key with analytics:read / links:read.
 */
export async function GET(request: NextRequest) {
  try {
    const limit = await rateLimit(request, { name: 'links-attention', limit: 60, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })

    const resolved = await resolveActor(request, ANALYTICS_READ_SCOPES)
    if (!resolved.actor) return NextResponse.json({ error: resolved.error === 'Authentication required' ? 'Unauthorized' : resolved.error }, { status: resolved.status })
    const userId = resolved.actor.userId

    const params = request.nextUrl.searchParams
    const issue = parseAttentionIssue(params.get('issue'))
    if (!issue) return NextResponse.json({ error: `issue must be one of: ${ATTENTION_ISSUES.join(', ')}` }, { status: 400 })
    const max = parseAttentionLimit(params.get('limit'))
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

    const links = await listLinksNeedingAttention(scope, issue, max)
    return NextResponse.json({ issue, links }, { headers: { 'Cache-Control': 'private, max-age=60' } })
  } catch (error) {
    console.error('Duplicate links failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
