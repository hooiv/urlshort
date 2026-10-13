import { NextRequest, NextResponse } from 'next/server'
import { getManageableUrl } from '@/lib/authorization'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { listLinkActivity, parseLimit } from '@/lib/link-activity'

/**
 * GET /api/links/:code/activity?limit=25&cursor=…&action=link.update
 * Who changed this link and what changed, newest first. Needs links:read
 * (API key), any workspace role, or the link's management token.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  try {
    const limit = await rateLimit(request, { name: 'link-activity', limit: 60, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })
    const { shortCode } = await context.params
    const access = await getManageableUrl(request, shortCode, undefined, { includeTrashed: true })
    if (!access.url) return NextResponse.json({ error: access.error }, { status: access.status })
    const params = request.nextUrl.searchParams
    const action = params.get('action')
    if (action && !/^[a-z0-9_.:-]{1,64}$/i.test(action)) return NextResponse.json({ error: 'Invalid action filter' }, { status: 400 })
    const result = await listLinkActivity(access.url.id, { limit: parseLimit(params.get('limit')), cursor: params.get('cursor'), action })
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })
    return NextResponse.json(result, { headers: rateLimitHeaders(limit) })
  } catch (error) {
    console.error('Link activity failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
