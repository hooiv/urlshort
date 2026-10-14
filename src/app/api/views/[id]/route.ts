import { NextRequest, NextResponse } from 'next/server'
import { LINK_WRITE_SCOPES, resolveActor } from '@/lib/request-actor'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { deleteSavedView, SavedViewError } from '@/lib/saved-views'

/** DELETE /api/views/:id — remove one of the caller's saved views. Requires links:write. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limit = await rateLimit(request, { name: 'views-write', limit: 30, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })
    const resolved = await resolveActor(request, LINK_WRITE_SCOPES)
    if (!resolved.actor) return NextResponse.json({ error: resolved.error === 'Authentication required' ? 'Unauthorized' : resolved.error }, { status: resolved.status })
    const { id } = await params
    await deleteSavedView(resolved.actor.userId, id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof SavedViewError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Saved view delete failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
