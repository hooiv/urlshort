import { NextRequest, NextResponse } from 'next/server'
import { LINK_READ_SCOPES, resolveActor } from '@/lib/request-actor'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { suggestTags, tagSuggestSchema } from '@/lib/tag-suggest'

/**
 * GET /api/tags/suggest?url=&workspaceId=&limit=
 * Tags the caller already uses on links to the same site. Session or API key with links:read.
 */
export async function GET(request: NextRequest) {
  try {
    const limit = await rateLimit(request, { name: 'tag-suggest', limit: 120, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })
    const resolved = await resolveActor(request, LINK_READ_SCOPES)
    if (!resolved.actor) return NextResponse.json({ error: resolved.error === 'Authentication required' ? 'Unauthorized' : resolved.error }, { status: resolved.status })
    const parsed = tagSuggestSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
    return NextResponse.json({ suggestions: await suggestTags(resolved.actor.userId, parsed.data) })
  } catch (error) {
    console.error('Tag suggest failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
