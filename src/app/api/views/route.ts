import { NextRequest, NextResponse } from 'next/server'
import { LINK_READ_SCOPES, LINK_WRITE_SCOPES, resolveActor } from '@/lib/request-actor'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { listSavedViews, savedViewInputSchema, SavedViewError, upsertSavedView } from '@/lib/saved-views'

/** GET /api/views — the caller's saved link filters. Session or API key with links:read. */
export async function GET(request: NextRequest) {
  try {
    const limit = await rateLimit(request, { name: 'views-list', limit: 120, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })
    const resolved = await resolveActor(request, LINK_READ_SCOPES)
    if (!resolved.actor) return NextResponse.json({ error: resolved.error === 'Authentication required' ? 'Unauthorized' : resolved.error }, { status: resolved.status })
    return NextResponse.json({ views: await listSavedViews(resolved.actor.userId) })
  } catch (error) {
    console.error('Saved views list failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

/** POST /api/views { name, filters } — create or overwrite a view. Requires links:write. */
export async function POST(request: NextRequest) {
  try {
    const limit = await rateLimit(request, { name: 'views-write', limit: 30, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })
    const resolved = await resolveActor(request, LINK_WRITE_SCOPES)
    if (!resolved.actor) return NextResponse.json({ error: resolved.error === 'Authentication required' ? 'Unauthorized' : resolved.error }, { status: resolved.status })
    let body: unknown
    try { body = JSON.parse(await request.text()) } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
    const parsed = savedViewInputSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
    const { view, created } = await upsertSavedView(resolved.actor.userId, parsed.data)
    return NextResponse.json({ view }, { status: created ? 201 : 200 })
  } catch (error) {
    if (error instanceof SavedViewError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Saved view save failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
