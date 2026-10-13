import { NextRequest, NextResponse } from 'next/server'
import { LINK_WRITE_SCOPES, resolveActor } from '@/lib/request-actor'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { recordAudit } from '@/lib/audit'
import { renameTag, tagRenameSchema, TagRenameError } from '@/lib/tag-manage'

/**
 * POST /api/tags/rename { from, to, workspaceId? }
 * Renames (or merges into an existing) tag on every editable link. Session or API key with links:write.
 */
export async function POST(request: NextRequest) {
  try {
    const limit = await rateLimit(request, { name: 'tag-rename', limit: 20, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })

    const resolved = await resolveActor(request, LINK_WRITE_SCOPES)
    if (!resolved.actor) return NextResponse.json({ error: resolved.error === 'Authentication required' ? 'Unauthorized' : resolved.error }, { status: resolved.status })

    let body: unknown
    try {
      body = JSON.parse(await request.text())
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const parsed = tagRenameSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })

    const result = await renameTag(resolved.actor.userId, parsed.data)
    if (result.updated > 0) {
      await recordAudit(request, {
        action: 'tag.rename', resourceType: 'tag', resourceId: result.to,
        before: { tag: result.from }, after: { tag: result.to },
        metadata: { updated: result.updated, workspaceId: parsed.data.workspaceId ?? null },
      })
    }
    return NextResponse.json({ from: result.from, to: result.to, updated: result.updated })
  } catch (error) {
    if (error instanceof TagRenameError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Tag rename failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
