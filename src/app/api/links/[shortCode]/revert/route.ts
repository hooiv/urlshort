import { NextRequest, NextResponse } from 'next/server'
import { getManageableUrl } from '@/lib/authorization'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { prisma } from '@/lib/prisma'
import { recordAudit } from '@/lib/audit'
import { invalidateLink } from '@/lib/link-cache'
import { RenameConflictError, renameLink } from '@/lib/link-rename'
import { loadEvent, planRevert } from '@/lib/link-revert'

/**
 * POST /api/links/:code/revert  { eventId }
 * Undo a link.update (title, active state) or link.rename from the activity
 * timeline. 409 when a newer change touched the same field.
 * Needs links:write (API key), an edit role, or the link's management token.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  try {
    const limit = await rateLimit(request, { name: 'link-revert', limit: 30, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })
    const { shortCode } = await context.params
    const access = await getManageableUrl(request, shortCode)
    if (!access.url) return NextResponse.json({ error: access.error }, { status: access.status })

    let body: { eventId?: unknown }
    try {
      body = JSON.parse(await request.text())
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    if (!body || typeof body !== 'object' || typeof body.eventId !== 'string' || !body.eventId || body.eventId.length > 64) {
      return NextResponse.json({ error: 'eventId is required' }, { status: 400 })
    }
    const event = await loadEvent(access.url.id, body.eventId)
    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

    const link = access.url
    const plan = planRevert(event, { title: link.title ?? null, isActive: link.isActive, shortCode: link.shortCode })
    if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: plan.status })

    const { shortCode: newCode, ...rest } = plan.data
    if (Object.keys(rest).length > 0) await prisma.url.update({ where: { id: link.id }, data: rest })
    if (newCode) {
      try {
        await renameLink(link.id, newCode)
      } catch (error) {
        if (error instanceof RenameConflictError) return NextResponse.json({ error: 'The previous short code is now taken' }, { status: 409 })
        throw error
      }
    }
    await invalidateLink(link.shortCode, link.id)
    if (newCode) await invalidateLink(newCode, link.id)
    await recordAudit(request, {
      action: 'link.revert', urlId: link.id, resourceType: 'url', resourceId: link.id,
      before: { eventId: event.id }, after: { fields: plan.fields },
    })
    return NextResponse.json({ reverted: plan.fields, shortCode: newCode ?? link.shortCode })
  } catch (error) {
    console.error('Link revert failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
