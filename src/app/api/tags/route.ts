import { NextRequest, NextResponse } from 'next/server'
import { LINK_WRITE_SCOPES, resolveActor } from '@/lib/request-actor'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { recordAudit } from '@/lib/audit'
import { deleteTag, tagDeleteSchema, TagRenameError } from '@/lib/tag-manage'

/**
 * DELETE /api/tags { tag, workspaceId? }
 * Removes a tag from every editable link. Session or API key with links:write.
 */
export async function DELETE(request: NextRequest) {
  try {
    const limit = await rateLimit(request, { name: 'tag-delete', limit: 20, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })

    const resolved = await resolveActor(request, LINK_WRITE_SCOPES)
    if (!resolved.actor) return NextResponse.json({ error: resolved.error === 'Authentication required' ? 'Unauthorized' : resolved.error }, { status: resolved.status })

    let body: unknown
    try {
      body = JSON.parse(await request.text())
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const parsed = tagDeleteSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })

    const result = await deleteTag(resolved.actor.userId, parsed.data)
    if (result.updated > 0) {
      await recordAudit(request, {
        action: 'tag.delete', resourceType: 'tag', resourceId: result.tag,
        before: { tag: result.tag }, after: null,
        metadata: { updated: result.updated, workspaceId: parsed.data.workspaceId ?? null },
      })
    }
    return NextResponse.json({ tag: result.tag, updated: result.updated })
  } catch (error) {
    if (error instanceof TagRenameError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Tag delete failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
