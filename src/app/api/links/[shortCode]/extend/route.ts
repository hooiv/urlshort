import { NextRequest, NextResponse } from 'next/server'
import { getManageableUrl } from '@/lib/authorization'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { extendLink, validateExtend } from '@/lib/link-extend'
import { invalidateLink } from '@/lib/link-cache'
import { recordAudit } from '@/lib/audit'
import { resolveActor, LINK_WRITE_SCOPES } from '@/lib/request-actor'
import { beginRouteIdempotency, releaseRouteIdempotency, storeRouteIdempotency } from '@/lib/idempotency-route'

/**
 * POST /api/links/:code/extend  { days?: number, addClicks?: number }
 * Pushes the expiry out (from the later of now and the current expiry) and/or raises the click cap.
 * Needs links:write (API key), an edit role, or the link's management token.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  try {
    const limit = await rateLimit(request, { name: 'link-extend', limit: 30, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })

    const { shortCode } = await context.params
    const access = await getManageableUrl(request, shortCode)
    if (!access.url) return NextResponse.json({ error: access.error }, { status: access.status })

    let body: { days?: unknown; addClicks?: unknown }
    try {
      body = JSON.parse(await request.text())
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    const checked = validateExtend(body)
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 })

    const resolved = await resolveActor(request, LINK_WRITE_SCOPES)
    const idem = await beginRouteIdempotency(request, resolved.actor?.userId ?? null, { code: access.url.shortCode, days: checked.days, addClicks: checked.addClicks })
    if (idem.invalid) return NextResponse.json({ error: idem.invalid }, { status: 400 })
    if (idem.replay) return idem.replay as NextResponse

    const before = { expiresAt: access.url.expiresAt ?? null, maxClicks: access.url.maxClicks ?? null }
    let updated
    try {
      updated = await extendLink(access.url.id, before, checked)
    } catch (error) {
      await releaseRouteIdempotency(idem)
      throw error
    }
    await invalidateLink(updated.shortCode, updated.id)
    await recordAudit(request, { action: 'link.extend', urlId: updated.id, resourceType: 'url', resourceId: updated.id, before, after: { expiresAt: updated.expiresAt, maxClicks: updated.maxClicks } })
    const payload = { id: updated.id, shortCode: updated.shortCode, expiresAt: updated.expiresAt, maxClicks: updated.maxClicks }
    await storeRouteIdempotency(request, idem, 200, payload)
    return NextResponse.json(payload)
  } catch (error) {
    console.error('Extend link failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
