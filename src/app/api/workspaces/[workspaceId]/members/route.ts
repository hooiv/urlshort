import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getWorkspaceMembership, requireWorkspaceRole, ADMIN_ROLES } from '@/lib/workspaces'
import { recordAudit } from '@/lib/audit'

export async function GET(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await context.params
  const access = await getWorkspaceMembership(request, workspaceId)
  if (!access) return NextResponse.json({ error: 'Workspace access required' }, { status: 401 })
  const members = await prisma.membership.findMany({ where: { workspaceId }, include: { user: { select: { id: true, email: true, name: true } } }, orderBy: { createdAt: 'asc' } })
  return NextResponse.json(members.map((m) => ({ id: m.user.id, membershipId: m.id, email: m.user.email, name: m.user.name, role: m.role })))
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await context.params
  const access = await requireWorkspaceRole(request, workspaceId, ADMIN_ROLES)
  if (!access.membership) return NextResponse.json({ error: access.error }, { status: access.status })
  const body = (await request.json()) as Record<string, unknown>
  const userId = String(body.userId ?? '')
  const role = String(body.role ?? '')
  if (!['owner', 'admin', 'editor', 'analyst', 'viewer'].includes(role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  if (userId === access.membership.userId && role !== 'owner' && access.membership.role === 'owner') return NextResponse.json({ error: 'Transfer ownership before changing your own role' }, { status: 409 })
  const target = await prisma.membership.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } })
  if (!target) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  if (target.role === 'owner' && access.membership.role !== 'owner') return NextResponse.json({ error: 'Only the owner can change the owner role' }, { status: 403 })
  if (role === 'owner' && access.membership.role !== 'owner') return NextResponse.json({ error: 'Only the owner can transfer ownership' }, { status: 403 })
  const updated = await prisma.membership.update({ where: { id: target.id }, data: { role: role as never } })
  if (role === 'owner') await prisma.membership.update({ where: { id: access.membership.id }, data: { role: 'admin' } })
  await recordAudit(request, { action: 'workspace.member_role.update', resourceType: 'membership', resourceId: target.id, metadata: { workspaceId, userId, role }, urlId: null })
  return NextResponse.json({ id: updated.userId, role: updated.role })
}

/**
 * DELETE /api/workspaces/[workspaceId]/members?userId=<id>
 * Remove a member (admin/owner). Owners cannot be removed — transfer
 * ownership first. A member can also remove *themselves* (leave workspace)
 * regardless of role, except the sole owner.
 */
export async function DELETE(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await context.params
  const access = await getWorkspaceMembership(request, workspaceId)
  if (!access) return NextResponse.json({ error: 'Workspace access required' }, { status: 401 })

  const targetUserId = request.nextUrl.searchParams.get('userId') || access.userId
  const isSelf = targetUserId === access.userId

  // Self-removal (leave) is always allowed for non-owners; removing others needs admin.
  if (!isSelf) {
    if (!ADMIN_ROLES.includes(access.role)) return NextResponse.json({ error: 'Insufficient workspace permissions' }, { status: 403 })
  }

  const target = await prisma.membership.findUnique({ where: { workspaceId_userId: { workspaceId, userId: targetUserId } } })
  if (!target) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  if (target.role === 'owner') return NextResponse.json({ error: 'The owner cannot be removed. Transfer ownership first.' }, { status: 409 })

  await prisma.membership.delete({ where: { id: target.id } })
  await recordAudit(request, { action: isSelf ? 'workspace.leave' : 'workspace.member_remove', resourceType: 'membership', resourceId: target.id, metadata: { workspaceId, userId: targetUserId, role: target.role } })
  return NextResponse.json({ removed: true, userId: targetUserId })
}
