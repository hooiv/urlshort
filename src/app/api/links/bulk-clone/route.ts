import { NextRequest, NextResponse } from 'next/server'
import { getManageableUrl } from '@/lib/authorization'
import { resolveActor, LINK_WRITE_SCOPES } from '@/lib/request-actor'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { cloneLink, validateBulkCloneCodes } from '@/lib/link-clone'
import { recordAudit } from '@/lib/audit'
import { getBaseUrl } from '@/lib/utils'

/**
 * POST /api/links/bulk-clone  { codes: string[] }  (max 50)
 * Clones each link under an auto-generated code. Per-link results: one
 * failure (missing, forbidden) never blocks the others.
 */
export async function POST(request: NextRequest) {
  try {
    const limit = await rateLimit(request, { name: 'link-bulk-clone', limit: 10, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const parsed = validateBulkCloneCodes(body)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const resolved = await resolveActor(request, LINK_WRITE_SCOPES)
    const actorUserId = resolved.actor?.userId ?? null
    const results: Array<{ from: string; shortCode?: string; shortUrl?: string; error?: string }> = []
    for (const code of parsed.codes) {
      const access = await getManageableUrl(request, code)
      if (!access.url) {
        results.push({ from: code, error: access.error ?? 'Not found' })
        continue
      }
      try {
        const clone = await cloneLink(access.url, null, actorUserId)
        await recordAudit(request, { action: 'link.clone', urlId: clone.id, resourceType: 'url', resourceId: clone.id, after: { shortCode: clone.shortCode, clonedFrom: code, bulk: true } })
        results.push({ from: code, shortCode: clone.shortCode, shortUrl: `${getBaseUrl()}/${clone.shortCode}` })
      } catch (error) {
        console.error('Bulk clone item failed:', error)
        results.push({ from: code, error: 'Clone failed' })
      }
    }
    const cloned = results.filter((r) => r.shortCode).length
    return NextResponse.json({ cloned, failed: results.length - cloned, results }, { status: cloned ? 201 : 200 })
  } catch (error) {
    console.error('Bulk clone failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
