import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'

export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const user = await getCurrentUser(request)
  if (!user) return NextResponse.json({ error: 'Sign in before accepting an invitation' }, { status: 401 })
  const { token } = await context.params
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const invite = await prisma.workspaceInvite.findUnique({ where: { tokenHash } })
  if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt <= new Date()) return NextResponse.json({ error: 'Invitation is invalid or expired' }, { status: 410 })
  if (invite.email !== user.email) return NextResponse.json({ error: 'This invitation was issued to a different email address' }, { status: 403 })
  await prisma.$transaction([
    prisma.membership.upsert({ where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: user.id } }, update: { role: invite.role }, create: { workspaceId: invite.workspaceId, userId: user.id, role: invite.role } }),
    prisma.workspaceInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
  ])
  await recordAudit(request, { action: 'workspace.invite.accept', resourceType: 'workspace', resourceId: invite.workspaceId, actorUserId: user.id, metadata: { inviteId: invite.id, role: invite.role } })
  return NextResponse.json({ workspaceId: invite.workspaceId, role: invite.role })
}
