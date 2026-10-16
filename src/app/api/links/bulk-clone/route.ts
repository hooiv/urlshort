import { NextRequest, NextResponse } from 'next/server'
import { getManageableUrl } from '@/lib/authorization'
import { resolveActor, LINK_WRITE_SCOPES } from '@/lib/request-actor'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { cloneLink, validateBulkCloneCodes } from '@/lib/link-clone'
import { recordAudit } from '@/lib/audit'
import { getBaseUrl } from '@/lib/utils'
import { prisma } from '@/lib/prisma'
import { getIdempotentResponse, storeIdempotentResponse, withIdempotencyCleanup } from '@/lib/idempotency'

/**
 * POST /api/links/bulk-clone  { codes: string[] }  (max 50)
 * Clones each link under an auto-generated code. Per-link results: one
 * failure (missing, forbidden) never blocks the others.
 */
async function handlePost(request: NextRequest) {
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
    // Idempotency-Key: a retried batch replays the first result instead of
    // creating a second set of auto-coded copies.
    let idem: Awaited<ReturnType<typeof getIdempotentResponse>> = null
    let idemWorkspaceId: string | null = null
    if (actorUserId && request.headers.get('idempotency-key')) {
      const membership = await prisma.membership.findFirst({ where: { userId: actorUserId }, orderBy: { createdAt: 'asc' }, select: { workspaceId: true } })
      if (membership) {
        idemWorkspaceId = membership.workspaceId
        try {
          idem = await getIdempotentResponse(request, membership.workspaceId, { codes: parsed.codes })
        } catch (error) {
          return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid Idempotency-Key' }, { status: 400 })
        }
        if (idem?.existing) return new NextResponse(idem.existing.responseJson, { status: idem.existing.responseStatus, headers: { 'Content-Type': 'application/json', 'Idempotent-Replay': 'true' } })
      }
    }
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
    const payload = { cloned, failed: results.length - cloned, results }
    const status = cloned ? 201 : 200
    if (idem && idemWorkspaceId) {
      await storeIdempotentResponse({ workspaceId: idemWorkspaceId, keyHash: idem.keyHash, requestHash: idem.requestHash, method: request.method, path: request.nextUrl.pathname, status, body: payload }).catch((e) => console.error('Idempotency store failed:', e))
    }
    return NextResponse.json(payload, { status })
  } catch (error) {
    console.error('Bulk clone failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export const POST = withIdempotencyCleanup(handlePost)
