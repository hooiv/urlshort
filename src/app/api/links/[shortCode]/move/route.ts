import { NextRequest, NextResponse } from 'next/server'
import { getManageableUrl } from '@/lib/authorization'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { MoveDeniedError, moveLink, validateMove } from '@/lib/link-move'
import { invalidateLink } from '@/lib/link-cache'
import { recordAudit } from '@/lib/audit'
import { resolveActor, LINK_WRITE_SCOPES } from '@/lib/request-actor'

/**
 * POST /api/links/:code/move  { workspaceId: string | null, confirm: true }
 * Needs a signed-in user or links:write key with an edit role in both the
 * source and target workspace. Management tokens cannot move links because
 * they carry no identity to check against the target.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  try {
    const limit = await rateLimit(request, { name: 'link-move', limit: 30, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })

    const resolved = await resolveActor(request, LINK_WRITE_SCOPES)
    if (!resolved.actor) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

    const { shortCode } = await context.params
    const access = await getManageableUrl(request, shortCode)
    if (!access.url) return NextResponse.json({ error: access.error }, { status: access.status })

    let body: { workspaceId?: unknown; confirm?: unknown }
    try {
      body = JSON.parse(await request.text())
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    if (!body || typeof body !== 'object' || Array.isArray(body) || !('workspaceId' in body)) return NextResponse.json({ error: 'workspaceId is required (use null for personal)' }, { status: 400 })
    const checked = validateMove(body, access.url.workspaceId)
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 })

    let moved
    try {
      moved = await moveLink(access.url, resolved.actor.userId, checked.workspaceId)
    } catch (error) {
      if (error instanceof MoveDeniedError) return NextResponse.json({ error: error.message }, { status: 403 })
      throw error
    }
    await invalidateLink(moved.shortCode, moved.id)
    await recordAudit(request, {
      action: 'link.move', urlId: moved.id, resourceType: 'url', resourceId: moved.id,
      before: { workspaceId: access.url.workspaceId, folderId: access.url.folderId }, after: { workspaceId: moved.workspaceId, folderId: null },
    })
    return NextResponse.json({ id: moved.id, shortCode: moved.shortCode, workspaceId: moved.workspaceId })
  } catch (error) {
    console.error('Move link failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
