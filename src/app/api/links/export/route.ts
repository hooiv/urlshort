import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveActor } from '@/lib/request-actor'
import { READ_ROLES } from '@/lib/authorization'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { canAdministerFolders } from '@/lib/folders'
import type { AnalyticsScope } from '@/lib/aggregate-analytics'
import { exportLinks, linksToCsv, parseExportFormat } from '@/lib/links-export'
import { recordAudit } from '@/lib/audit'

/**
 * GET /api/links/export?format=csv|json&workspaceId=
 * Full link inventory for the account or workspace. Session auth or API key with links:read.
 */
export async function GET(request: NextRequest) {
  try {
    const limit = await rateLimit(request, { name: 'links-export', limit: 10, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })

    const resolved = await resolveActor(request, ['links:read', 'links:write'])
    if (!resolved.actor) return NextResponse.json({ error: resolved.error === 'Authentication required' ? 'Unauthorized' : resolved.error }, { status: resolved.status })
    const userId = resolved.actor.userId

    const params = request.nextUrl.searchParams
    const format = parseExportFormat(params.get('format'))
    if (!format) return NextResponse.json({ error: 'format must be csv or json' }, { status: 400 })
    const workspaceId = params.get('workspaceId')
    let scope: AnalyticsScope
    if (workspaceId) {
      const membership = await prisma.membership.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { role: true } })
      if (!membership || !READ_ROLES.includes(membership.role)) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
      scope = { kind: 'workspace', workspaceId, viewer: canAdministerFolders(membership.role) ? undefined : { userId } }
    } else {
      scope = { kind: 'user', userId }
    }

    const { links, truncated } = await exportLinks(scope)
    await recordAudit(request, { action: 'links.export', resourceType: 'workspace', resourceId: workspaceId ?? userId, after: { format, count: links.length } })
    const headers = { 'Cache-Control': 'private, no-store', 'X-Export-Truncated': String(truncated) }
    if (format === 'json') return NextResponse.json({ links, truncated }, { headers })
    return new NextResponse(linksToCsv(links), { headers: { ...headers, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="links.csv"' } })
  } catch (error) {
    console.error('Links export failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
