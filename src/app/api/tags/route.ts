import { NextRequest, NextResponse } from 'next/server'
import { LINK_READ_SCOPES, LINK_WRITE_SCOPES, resolveActor } from '@/lib/request-actor'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { recordAudit } from '@/lib/audit'
import { beginRouteIdempotency, releaseRouteIdempotency, storeRouteIdempotency } from '@/lib/idempotency-route'
import { deleteTag, listTags, tagDeleteSchema, tagListSchema, TagRenameError } from '@/lib/tag-manage'

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

    const idem = await beginRouteIdempotency(request, resolved.actor.userId, parsed.data)
    if (idem.invalid) return NextResponse.json({ error: idem.invalid }, { status: 400 })
    if (idem.replay) return idem.replay as NextResponse

    let result
    try {
      result = await deleteTag(resolved.actor.userId, parsed.data)
    } catch (error) {
      await releaseRouteIdempotency(idem)
      throw error
    }
    if (result.updated > 0) {
      await recordAudit(request, {
        action: 'tag.delete', resourceType: 'tag', resourceId: result.tag,
        before: { tag: result.tag }, after: null,
        metadata: { updated: result.updated, workspaceId: parsed.data.workspaceId ?? null },
      })
    }
    const payload = { tag: result.tag, updated: result.updated }
    await storeRouteIdempotency(request, idem, 200, payload)
    return NextResponse.json(payload)
  } catch (error) {
    if (error instanceof TagRenameError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Tag delete failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

/**
 * GET /api/tags?workspaceId=&q=&limit=
 * Tags in use with link counts, most used first. Session or API key with links:read.
 */
export async function GET(request: NextRequest) {
  try {
    const limit = await rateLimit(request, { name: 'tag-list', limit: 120, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })

    const resolved = await resolveActor(request, LINK_READ_SCOPES)
    if (!resolved.actor) return NextResponse.json({ error: resolved.error === 'Authentication required' ? 'Unauthorized' : resolved.error }, { status: resolved.status })

    const params = Object.fromEntries(request.nextUrl.searchParams)
    const parsed = tagListSchema.safeParse(params)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })

    const tags = await listTags(resolved.actor.userId, parsed.data)
    return NextResponse.json({ tags })
  } catch (error) {
    if (error instanceof TagRenameError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Tag list failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
