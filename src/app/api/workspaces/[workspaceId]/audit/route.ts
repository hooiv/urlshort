import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ADMIN_ROLES, getWorkspaceMembership } from '@/lib/workspaces'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { AUDIT_EXPORT_MAX_ROWS, auditToCsv, auditToJson, parseAuditRange, workspaceAuditWhere } from '@/lib/audit-export'

const SELECT = { id: true, createdAt: true, action: true, actorType: true, actorUserId: true, urlId: true, resourceType: true, resourceId: true, ipHash: true, userAgent: true, beforeJson: true, afterJson: true, metadataJson: true } as const
const LINK_ID_CAP = 50_000

/**
 * GET /api/workspaces/:id/audit?action=link.*&actor=<userId>&from=YYYY-MM-DD&to=YYYY-MM-DD&search=&limit=&cursor=&format=json|csv
 * Owners and admins only. `format=csv` downloads up to 10,000 rows for the range.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await context.params
  const limit = await rateLimit(request, { name: 'workspace-audit', limit: 30, windowMs: 60_000 })
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })

  const membership = await getWorkspaceMembership(request, workspaceId)
  if (!membership) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  if (!ADMIN_ROLES.includes(membership.role)) return NextResponse.json({ error: 'Admin permission is required' }, { status: 403 })

  const p = request.nextUrl.searchParams
  const format = p.get('format') ?? 'json'
  if (format !== 'json' && format !== 'csv') return NextResponse.json({ error: 'format must be json or csv' }, { status: 400 })
  let range
  try {
    range = parseAuditRange(p.get('from'), p.get('to'))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid range' }, { status: 400 })
  }

  const links = await prisma.url.findMany({ where: { workspaceId }, select: { id: true }, take: LINK_ID_CAP })
  const where = workspaceAuditWhere(workspaceId, links.map((l) => l.id), {
    action: p.get('action')?.trim().slice(0, 100) || undefined,
    actorUserId: p.get('actor')?.trim().slice(0, 64) || undefined,
    search: p.get('search')?.trim().slice(0, 200) || undefined,
    ...range,
  })
  const order = [{ createdAt: 'desc' as const }, { id: 'desc' as const }]

  if (format === 'csv') {
    const rows = await prisma.auditEvent.findMany({ where, orderBy: order, take: AUDIT_EXPORT_MAX_ROWS, select: SELECT })
    return new NextResponse(auditToCsv(rows), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="quicklink-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
        'Cache-Control': 'private, no-store',
        'X-Truncated': rows.length === AUDIT_EXPORT_MAX_ROWS ? 'true' : 'false',
      },
    })
  }

  const take = Math.min(Math.max(Number(p.get('limit') || 50) || 50, 1), 200)
  const cursor = p.get('cursor')
  const rows = await prisma.auditEvent.findMany({ where, orderBy: order, take: take + 1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), select: SELECT })
  const nextCursor = rows.length > take ? rows.pop()!.id : null
  return NextResponse.json({ items: auditToJson(rows), nextCursor }, { headers: { 'Cache-Control': 'private, no-store' } })
}
