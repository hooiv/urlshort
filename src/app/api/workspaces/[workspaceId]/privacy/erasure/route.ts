import { NextRequest, NextResponse } from 'next/server'
import { requireWorkspaceRole } from '@/lib/workspaces'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { recordAudit } from '@/lib/audit'
import { eraseVisitor } from '@/lib/visitor-erasure'

/**
 * POST /api/workspaces/:id/privacy/erasure  { ip?, visitorId?, dryRun? }
 * Deletes the raw click events that identify one visitor in this workspace
 * (data-subject erasure). Owner/admin only; audited without storing the subject.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const a = await requireWorkspaceRole(request, workspaceId, ['owner', 'admin'])
  if (!a.membership) return NextResponse.json({ error: a.error }, { status: a.status })
  const limit = await rateLimit(request, { name: 'privacy-erasure', limit: 30, windowMs: 60_000 })
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })

  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const dryRun = b.dryRun === true
  try {
    const result = await eraseVisitor(workspaceId, { ip: b.ip as string | undefined, visitorId: b.visitorId as string | undefined }, { dryRun })
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })
    if (!dryRun) {
      await recordAudit(request, { action: 'privacy.erasure', resourceType: 'workspace', resourceId: workspaceId, metadata: { deleted: result.deleted, by: b.ip ? 'ip' : 'visitorId' } })
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error('Erasure failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
