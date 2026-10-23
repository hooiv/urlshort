import { NextRequest, NextResponse } from 'next/server'
import { requireWorkspaceRole, ADMIN_ROLES } from '@/lib/workspaces'
import { recordAudit } from '@/lib/audit'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { reassignLinks, reassignSchema, ReassignError } from '@/lib/link-reassign'

/**
 * POST /api/workspaces/:id/reassign-links { fromUserId, toUserId, dryRun?, confirm? }
 * Owner/admin only (session). Moves link ownership between members, e.g. when someone leaves.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const limit = await rateLimit(request, { name: 'link-reassign', limit: 10, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })
    const { workspaceId } = await context.params
    const access = await requireWorkspaceRole(request, workspaceId, ADMIN_ROLES)
    if (!access.membership) return NextResponse.json({ error: access.error }, { status: access.status })

    let body: unknown
    try { body = JSON.parse(await request.text()) } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
    const parsed = reassignSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })

    const result = await reassignLinks(workspaceId, parsed.data)
    if (!result.dryRun && result.reassigned > 0) {
      await recordAudit(request, {
        action: 'workspace.links_reassign', resourceType: 'workspace', resourceId: workspaceId,
        before: { userId: parsed.data.fromUserId }, after: { userId: parsed.data.toUserId },
        metadata: { workspaceId, reassigned: result.reassigned }, urlId: null,
      })
    }
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof ReassignError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Link reassign failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
