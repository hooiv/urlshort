import { NextRequest, NextResponse } from 'next/server'
import { getManageableUrl } from '@/lib/authorization'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { normalizeHost } from '@/lib/domains'
import { prisma } from '@/lib/prisma'
import { updateDomainFallbacks, validateDomainSettings } from '@/lib/domain-settings'
import { invalidateDomain } from '@/lib/link-cache'
import { recordAudit } from '@/lib/audit'

/**
 * GET/PATCH /api/links/:code/domain-settings?host=go.acme.com
 * Root redirect and 404 fallback for a verified branded domain owned by this link.
 * Needs links:read / links:write (API key), an edit role, or the management token.
 */
async function resolve(request: NextRequest, shortCode: string, write: boolean) {
  const access = await getManageableUrl(request, shortCode)
  if (!access.url) return { error: NextResponse.json({ error: access.error }, { status: access.status }) }
  let host: string
  try { host = normalizeHost(request.nextUrl.searchParams.get('host') ?? '') } catch (error) {
    return { error: NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid host' }, { status: 400 }) }
  }
  const domain = await prisma.brandedDomain.findUnique({ where: { host } })
  if (!domain || domain.ownerUrlId !== access.url.id) return { error: NextResponse.json({ error: 'Domain not found for this link' }, { status: 404 }) }
  if (write && domain.status !== 'verified') return { error: NextResponse.json({ error: 'Verify the domain before setting fallbacks' }, { status: 409 }) }
  return { url: access.url, domain, host }
}

export async function GET(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  const { shortCode } = await context.params
  const found = await resolve(request, shortCode, false)
  if (found.error) return found.error
  return NextResponse.json({ host: found.host, status: found.domain.status, rootRedirectUrl: found.domain.rootRedirectUrl, notFoundUrl: found.domain.notFoundUrl })
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  try {
    const limit = await rateLimit(request, { name: 'domain-settings', limit: 30, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })
    const { shortCode } = await context.params
    const found = await resolve(request, shortCode, true)
    if (found.error) return found.error
    let body: unknown
    try { body = JSON.parse(await request.text()) } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
    const checked = validateDomainSettings(body, found.host)
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 })
    const updated = await updateDomainFallbacks(found.domain.id, checked.value)
    await invalidateDomain(found.host)
    await recordAudit(request, { action: 'branded_domain.fallbacks', urlId: found.url.id, resourceType: 'branded_domain', resourceId: found.domain.id, before: { rootRedirectUrl: found.domain.rootRedirectUrl, notFoundUrl: found.domain.notFoundUrl }, after: updated })
    return NextResponse.json(updated)
  } catch (error) {
    console.error('Domain settings failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
