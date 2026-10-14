import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ADMIN_ROLES, getWorkspaceMembership } from '@/lib/workspaces'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { autoTagRulesSchema } from '@/lib/auto-tag-rules'
import { loadAutoTagRules } from '@/lib/auto-tag-rules-store'
import { recordAudit } from '@/lib/audit'

async function gate(request: NextRequest, workspaceId: string, admin: boolean) {
  const membership = await getWorkspaceMembership(request, workspaceId)
  if (!membership) return { error: NextResponse.json({ error: 'Workspace not found' }, { status: 404 }) }
  if (admin && !ADMIN_ROLES.includes(membership.role)) return { error: NextResponse.json({ error: 'Admin permission is required' }, { status: 403 }) }
  return { membership }
}

/** GET /api/workspaces/:id/auto-tag-rules — any member. */
export async function GET(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await context.params
  const g = await gate(request, workspaceId, false)
  if (g.error) return g.error
  return NextResponse.json({ rules: await loadAutoTagRules(prisma, workspaceId) }, { headers: { 'Cache-Control': 'private, no-store' } })
}

/** PUT /api/workspaces/:id/auto-tag-rules — replace the rule list (admins). Body: { rules: AutoTagRule[] }. */
export async function PUT(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await context.params
  const limit = await rateLimit(request, { name: 'workspace-auto-tag-rules', limit: 20, windowMs: 60_000 })
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })
  const g = await gate(request, workspaceId, true)
  if (g.error) return g.error
  const body = await request.json().catch(() => null)
  const parsed = autoTagRulesSchema.safeParse(body?.rules)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => `${i.path.join('.') || 'rules'}: ${i.message}`).join('; ') }, { status: 400 })
  const before = await loadAutoTagRules(prisma, workspaceId)
  await prisma.workspaceAutoTagRules.upsert({
    where: { workspaceId },
    create: { workspaceId, rules: JSON.stringify(parsed.data), updatedBy: g.membership.userId },
    update: { rules: JSON.stringify(parsed.data), updatedBy: g.membership.userId },
  })
  await recordAudit(request, { actorUserId: g.membership.userId, action: 'workspace.auto_tag_rules.update', resourceType: 'workspace', resourceId: workspaceId, before, after: parsed.data })
  return NextResponse.json({ rules: parsed.data }, { headers: rateLimitHeaders(limit) })
}
