import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ANALYTICS_READ_SCOPES, resolveActor } from '@/lib/request-actor'
import { READ_ROLES } from '@/lib/authorization'
import { rateLimit } from '@/lib/rate-limit'
import { canAdministerFolders, effectiveFolderRole } from '@/lib/folders'
import { analyticsToCsv, exportFilename, parseExportSection } from '@/lib/analytics-export'
import { getAggregatedAnalytics, resolveWindow, type AnalyticsScope } from '@/lib/aggregate-analytics'

const TAG = /^[a-z0-9][a-z0-9-_ ]{0,31}$/

/**
 * GET /api/analytics?workspaceId=&folder=<id|none>&tag=&range=7d|30d|90d|365d&from=YYYY-MM-DD&to=YYYY-MM-DD&format=json|csv&section=timeseries|links|tags|countries|devices|referrers
 *
 * Account-wide (or workspace-wide, or per-tag) analytics: totals with
 * period-over-period change, a gap-free daily series, top links, tag
 * leaderboard, revenue by currency and human-traffic breakdowns.
 */
export async function GET(request: NextRequest) {
  try {
    const limit = await rateLimit(request, { name: 'analytics-aggregate', limit: 60, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } })

    const resolved = await resolveActor(request, ANALYTICS_READ_SCOPES)
    if (!resolved.actor) return NextResponse.json({ error: resolved.error === 'Authentication required' ? 'Unauthorized' : resolved.error }, { status: resolved.status })
    const user = { id: resolved.actor.userId }

    const params = request.nextUrl.searchParams
    const workspaceId = params.get('workspaceId')
    const rawTag = params.get('tag')
    const tag = rawTag ? rawTag.trim().toLowerCase() : undefined
    if (tag !== undefined && !TAG.test(tag)) return NextResponse.json({ error: 'Invalid tag' }, { status: 400 })

    let window
    try {
      window = resolveWindow({ range: params.get('range'), from: params.get('from'), to: params.get('to') })
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid date range' }, { status: 400 })
    }

    let scope: AnalyticsScope
    if (workspaceId) {
      const membership = await prisma.membership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: user.id } },
        select: { role: true },
      })
      // 404, not 403: don't confirm which workspace ids exist.
      if (!membership || !READ_ROLES.includes(membership.role)) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
      const folderParam = params.get('folder')
      const folderId = folderParam === 'none' ? null : folderParam || undefined
      if (folderId) {
        const folder = await prisma.folder.findFirst({ where: { id: folderId, workspaceId }, select: { restricted: true, access: { where: { userId: user.id }, select: { role: true } } } })
        if (!folder || effectiveFolderRole(membership.role, folder, folder.access[0]?.role ?? null) === null) return NextResponse.json({ error: 'Folder not found' }, { status: 404 })
      }
      scope = { kind: 'workspace', workspaceId, tag, folderId, viewer: canAdministerFolders(membership.role) ? undefined : { userId: user.id } }
    } else {
      scope = { kind: 'user', userId: user.id, tag }
    }

    const data = await getAggregatedAnalytics(scope, window)
    const format = params.get('format')
    if (format === 'csv') {
      const section = parseExportSection(params.get('section'))
      if (!section) return NextResponse.json({ error: 'Invalid section' }, { status: 400 })
      return new NextResponse(analyticsToCsv(data, section), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${exportFilename(section, data.window)}"`,
          'Cache-Control': 'private, no-store',
        },
      })
    }
    if (format !== null && format !== 'json') return NextResponse.json({ error: 'Invalid format' }, { status: 400 })
    return NextResponse.json(data, { headers: { 'Cache-Control': 'private, max-age=60' } })
  } catch (error) {
    console.error('Aggregated analytics failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
