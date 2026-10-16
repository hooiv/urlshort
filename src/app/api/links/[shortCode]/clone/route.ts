import { NextRequest, NextResponse } from 'next/server'
import { getManageableUrl } from '@/lib/authorization'
import { resolveActor, LINK_WRITE_SCOPES } from '@/lib/request-actor'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { CodeTakenError, cloneLink, validateCloneCode } from '@/lib/link-clone'
import { recordAudit } from '@/lib/audit'
import { getBaseUrl } from '@/lib/utils'
import { prisma } from '@/lib/prisma'
import { getIdempotentResponse, releaseIdempotencyClaim, storeIdempotentResponse } from '@/lib/idempotency'

/**
 * POST /api/links/:code/clone  { shortCode?: string }
 * Copies a link's settings and routing rules to a new short code.
 * Needs links:write (API key), an edit role, or the link's management token.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  try {
    const limit = await rateLimit(request, { name: 'link-clone', limit: 30, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })

    const { shortCode } = await context.params
    const access = await getManageableUrl(request, shortCode)
    if (!access.url) return NextResponse.json({ error: access.error }, { status: access.status })

    let body: { shortCode?: unknown } = {}
    try {
      const text = await request.text()
      if (text.trim()) body = JSON.parse(text)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    const code = validateCloneCode(body.shortCode)
    if (!code.ok) return NextResponse.json({ error: code.error }, { status: 400 })

    const resolved = await resolveActor(request, LINK_WRITE_SCOPES)
    const actorUserId = resolved.actor?.userId ?? null
    // Idempotency-Key: a retried POST replays the first clone instead of
    // creating a second auto-coded copy. Scoped to the actor's primary workspace.
    let idem: Awaited<ReturnType<typeof getIdempotentResponse>> = null
    let idemWorkspaceId: string | null = null
    if (actorUserId && request.headers.get('idempotency-key')) {
      const membership = await prisma.membership.findFirst({ where: { userId: actorUserId }, orderBy: { createdAt: 'asc' }, select: { workspaceId: true } })
      if (membership) {
        idemWorkspaceId = membership.workspaceId
        try {
          idem = await getIdempotentResponse(request, membership.workspaceId, { from: access.url.shortCode, shortCode: code.code ?? null })
        } catch (error) {
          return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid Idempotency-Key' }, { status: 400 })
        }
        if (idem?.existing) return new NextResponse(idem.existing.responseJson, { status: idem.existing.responseStatus, headers: { 'Content-Type': 'application/json', 'Idempotent-Replay': 'true' } })
      }
    }
    let clone
    try {
      clone = await cloneLink(access.url, code.code, actorUserId)
    } catch (error) {
      if (idem && idemWorkspaceId) await releaseIdempotencyClaim(idemWorkspaceId, idem.keyHash).catch(() => undefined)
      if (error instanceof CodeTakenError) return NextResponse.json({ error: 'Short code already in use' }, { status: 409 })
      throw error
    }
    await recordAudit(request, { action: 'link.clone', urlId: clone.id, resourceType: 'url', resourceId: clone.id, after: { shortCode: clone.shortCode, clonedFrom: access.url.shortCode, rulesCopied: clone.rulesCopied } })
    const payload = { ...clone, shortUrl: `${getBaseUrl()}/${clone.shortCode}`, clonedFrom: access.url.shortCode }
    if (idem && idemWorkspaceId) {
      await storeIdempotentResponse({ workspaceId: idemWorkspaceId, keyHash: idem.keyHash, requestHash: idem.requestHash, method: request.method, path: request.nextUrl.pathname, status: 201, body: payload }).catch((e) => console.error('Idempotency store failed:', e))
    }
    return NextResponse.json(payload, { status: 201 })
  } catch (error) {
    console.error('Clone link failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
