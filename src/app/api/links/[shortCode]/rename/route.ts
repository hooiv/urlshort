import { NextRequest, NextResponse } from 'next/server'
import { getManageableUrl } from '@/lib/authorization'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { RenameConflictError, renameLink, validateRename } from '@/lib/link-rename'
import { invalidateLink } from '@/lib/link-cache'
import { recordAudit } from '@/lib/audit'
import { getBaseUrl } from '@/lib/utils'

/**
 * POST /api/links/:code/rename  { newShortCode: string, confirm: true }
 * The old short URL stops working at once, hence the mandatory confirm flag.
 * Needs links:write (API key), an edit role, or the link's management token.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  try {
    const limit = await rateLimit(request, { name: 'link-rename', limit: 30, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })

    const { shortCode } = await context.params
    const access = await getManageableUrl(request, shortCode)
    if (!access.url) return NextResponse.json({ error: access.error }, { status: access.status })

    let body: { newShortCode?: unknown; confirm?: unknown }
    try {
      body = JSON.parse(await request.text())
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    const checked = validateRename(body.newShortCode, access.url.shortCode)
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 })
    if (body.confirm !== true) return NextResponse.json({ error: 'The old short URL will stop working. Resend with confirm: true.' }, { status: 400 })

    let renamed
    try {
      renamed = await renameLink(access.url.id, checked.code)
    } catch (error) {
      if (error instanceof RenameConflictError) return NextResponse.json({ error: 'Short code already in use' }, { status: 409 })
      throw error
    }
    await invalidateLink(access.url.shortCode, access.url.id)
    await invalidateLink(renamed.shortCode, renamed.id)
    await recordAudit(request, { action: 'link.rename', urlId: renamed.id, resourceType: 'url', resourceId: renamed.id, before: { shortCode: access.url.shortCode }, after: { shortCode: renamed.shortCode } })
    return NextResponse.json({ id: renamed.id, shortCode: renamed.shortCode, previousShortCode: access.url.shortCode, shortUrl: `${getBaseUrl()}/${renamed.shortCode}` })
  } catch (error) {
    console.error('Rename link failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
