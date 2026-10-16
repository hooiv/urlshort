import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { getDefaultWorkspace, requireWorkspaceRole } from '@/lib/workspaces'
import { publishWorkspaceRoutingConfig } from '@/lib/routing-config'
import { rateLimit } from '@/lib/rate-limit'
import { recordAudit } from '@/lib/audit'
import { getIdempotentResponse, releaseIdempotencyClaim, storeIdempotentResponse } from '@/lib/idempotency'

export const schema = z.object({
  campaignIds: z.array(z.string().min(1)).min(1).max(50),
  action: z.enum(['start', 'pause', 'archive']),
})

const TARGET = { start: 'running', pause: 'paused', archive: 'archived' } as const
const ALLOWED_FROM = {
  start: ['draft', 'paused', 'scheduled'],
  pause: ['running'],
  archive: ['draft', 'paused', 'completed'],
} as const

/**
 * POST /api/campaigns/bulk { campaignIds, action }
 * Supports Idempotency-Key: without it a retry after a lost response would hit
 * 409 (already started) even though the first call succeeded; with it the
 * first result is replayed.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request)
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const workspaceId = request.nextUrl.searchParams.get('workspaceId') || (await getDefaultWorkspace(user.id))?.id
  if (!workspaceId) return NextResponse.json({ error: 'Workspace required' }, { status: 403 })
  const access = await requireWorkspaceRole(request, workspaceId, ['owner', 'admin', 'editor'])
  if (!access.membership) return NextResponse.json({ error: access.error }, { status: access.status })
  const limit = await rateLimit(request, { name: 'campaigns-bulk', limit: 10, windowMs: 60_000 })
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  let claim: Awaited<ReturnType<typeof getIdempotentResponse>> = null
  const fail = async (body: unknown, status: number) => {
    if (claim) await releaseIdempotencyClaim(workspaceId, claim.keyHash).catch(() => undefined)
    return NextResponse.json(body, { status })
  }
  try {
    let parsed: z.infer<typeof schema>
    try {
      parsed = schema.parse(await request.json())
    } catch {
      return NextResponse.json({ error: 'Invalid bulk campaign request' }, { status: 400 })
    }
    const ids = [...new Set(parsed.campaignIds)].sort()

    if (request.headers.get('idempotency-key')) {
      try {
        claim = await getIdempotentResponse(request, workspaceId, { ids, action: parsed.action })
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid Idempotency-Key' }, { status: 400 })
      }
      if (claim?.existing) {
        return new NextResponse(claim.existing.responseJson, { status: claim.existing.responseStatus, headers: { 'Content-Type': 'application/json', 'Idempotent-Replay': 'true' } })
      }
    }

    const campaigns = await prisma.campaign.findMany({ where: { id: { in: ids }, workspaceId }, select: { id: true, status: true } })
    if (campaigns.length !== ids.length) return fail({ error: 'One or more campaigns are not in this workspace' }, 404)
    const allowed: readonly string[] = ALLOWED_FROM[parsed.action]
    const invalid = campaigns.filter((c) => !allowed.includes(c.status))
    if (invalid.length) return fail({ error: `${invalid.length} campaign(s) cannot be ${parsed.action}ed from their current state` }, 409)

    await prisma.campaign.updateMany({ where: { id: { in: ids }, workspaceId }, data: { status: TARGET[parsed.action], version: { increment: 1 } } })
    await publishWorkspaceRoutingConfig(workspaceId)
    await recordAudit(request, { action: `campaign.bulk_${parsed.action}`, resourceType: 'campaign_batch', metadata: { workspaceId, campaignIds: ids, count: ids.length } })

    const payload = { ok: true, updated: ids.length, action: parsed.action }
    if (claim) {
      const c = claim
      claim = null
      await storeIdempotentResponse({ workspaceId, keyHash: c.keyHash, requestHash: c.requestHash, method: request.method, path: request.nextUrl.pathname, status: 200, body: payload }).catch((e) => console.error('Idempotency store failed:', e))
    }
    return NextResponse.json(payload)
  } catch (e) {
    console.error('Bulk campaign failed:', e)
    return fail({ error: 'Bulk operation failed' }, 500)
  }
}
