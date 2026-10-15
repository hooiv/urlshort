import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { LINK_READ_SCOPES, resolveActor } from '@/lib/request-actor'
import { READ_ROLES } from '@/lib/authorization'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { canAdministerFolders } from '@/lib/folders'
import type { AnalyticsScope } from '@/lib/aggregate-analytics'
import { prismaDeps, runPreflight } from '@/lib/link-preflight'

/**
 * POST /api/links/preflight  { url, workspaceId? }
 * Checks a destination before creating a link: validity, risk, reachability, redirects,
 * click-id params and existing links to the same page. Session auth or API key with links:read.
 */
export async function POST(request: NextRequest) {
  try {
    const limit = await rateLimit(request, { name: 'links-preflight', limit: 30, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })

    const resolved = await resolveActor(request, LINK_READ_SCOPES)
    if (!resolved.actor) return NextResponse.json({ error: resolved.error === 'Authentication required' ? 'Unauthorized' : resolved.error }, { status: resolved.status })
    const userId = resolved.actor.userId

    let body: unknown
    try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
    const { url, workspaceId } = (body ?? {}) as { url?: unknown; workspaceId?: unknown }
    if (typeof url !== 'string') return NextResponse.json({ error: 'url must be a string' }, { status: 400 })
    if (workspaceId !== undefined && typeof workspaceId !== 'string') return NextResponse.json({ error: 'workspaceId must be a string' }, { status: 400 })

    let scope: AnalyticsScope
    if (workspaceId) {
      const membership = await prisma.membership.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { role: true } })
      if (!membership || !READ_ROLES.includes(membership.role)) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
      scope = { kind: 'workspace', workspaceId, viewer: canAdministerFolders(membership.role) ? undefined : { userId } }
    } else {
      scope = { kind: 'user', userId }
    }
    return NextResponse.json(await runPreflight(url, prismaDeps(scope)), { headers: rateLimitHeaders(limit) })
  } catch (error) {
    console.error('Link preflight failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
