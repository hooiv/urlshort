import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ADMIN_ROLES, getWorkspaceMembership } from '@/lib/workspaces'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { linkPolicySchema } from '@/lib/link-policy'
import { loadWorkspacePolicy } from '@/lib/link-policy-store'
import { recordAudit } from '@/lib/audit'

async function gate(request: NextRequest, workspaceId: string, admin: boolean) {
  const membership = await getWorkspaceMembership(request, workspaceId)
  if (!membership) return { error: NextResponse.json({ error: 'Workspace not found' }, { status: 404 }) }
  if (admin && !ADMIN_ROLES.includes(membership.role)) return { error: NextResponse.json({ error: 'Admin permission is required' }, { status: 403 }) }
  return { membership }
}

/** GET /api/workspaces/:id/link-policy — any member can read the rules that will apply to their links. */
export async function GET(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await context.params
  const g = await gate(request, workspaceId, false)
  if (g.error) return g.error
  return NextResponse.json({ policy: await loadWorkspacePolicy(prisma, workspaceId) }, { headers: { 'Cache-Control': 'private, no-store' } })
}

/** PUT /api/workspaces/:id/link-policy — replace the policy (owners/admins). Body is a LinkPolicy; omitted fields take defaults. */
export async function PUT(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await context.params
  const limit = await rateLimit(request, { name: 'workspace-link-policy', limit: 20, windowMs: 60_000 })
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })
  const g = await gate(request, workspaceId, true)
  if (g.error) return g.error
  const body = await request.json().catch(() => null)
  const parsed = linkPolicySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ') }, { status: 400 })
  const policy = parsed.data
  if (policy.allowedDestinationHosts.some((h) => policy.blockedDestinationHosts.includes(h))) {
    return NextResponse.json({ error: 'A host cannot be both allowed and blocked' }, { status: 400 })
  }
  const before = await loadWorkspacePolicy(prisma, workspaceId)
  await prisma.workspaceLinkPolicy.upsert({
    where: { workspaceId },
    create: { workspaceId, policy: JSON.stringify(policy), updatedBy: g.membership.userId },
    update: { policy: JSON.stringify(policy), updatedBy: g.membership.userId },
  })
  await recordAudit(request, { actorUserId: g.membership.userId, action: 'workspace.link_policy.update', resourceType: 'workspace', resourceId: workspaceId, before, after: policy })
  return NextResponse.json({ policy }, { headers: rateLimitHeaders(limit) })
}

/** DELETE /api/workspaces/:id/link-policy — remove all rules. */
export async function DELETE(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await context.params
  const g = await gate(request, workspaceId, true)
  if (g.error) return g.error
  const res = await prisma.workspaceLinkPolicy.deleteMany({ where: { workspaceId } })
  if (res.count === 0) return NextResponse.json({ error: 'No link policy is set' }, { status: 404 })
  await recordAudit(request, { actorUserId: g.membership.userId, action: 'workspace.link_policy.delete', resourceType: 'workspace', resourceId: workspaceId })
  return NextResponse.json({ deleted: true })
}
