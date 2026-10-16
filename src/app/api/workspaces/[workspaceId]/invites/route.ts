import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { normalizeEmail } from '@/lib/auth'
import { ADMIN_ROLES, createInviteToken, hashInviteToken, requireWorkspaceRole } from '@/lib/workspaces'
import { recordAudit } from '@/lib/audit'
import { renderWorkspaceInviteEmail, sendEmail } from '@/lib/email'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { beginRouteIdempotency, releaseRouteIdempotency, storeRouteIdempotency } from '@/lib/idempotency-route'

export const inviteRoleSchema = z.enum(['admin', 'editor', 'analyst', 'viewer'])

export async function GET(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await context.params
  const access = await requireWorkspaceRole(request, workspaceId, ADMIN_ROLES)
  if (!access.membership) return NextResponse.json({ error: access.error }, { status: access.status })
  const invites = await prisma.workspaceInvite.findMany({ where: { workspaceId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' }, select: { id: true, email: true, role: true, expiresAt: true, createdAt: true } })
  return NextResponse.json(invites)
}

export async function POST(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await context.params
  const access = await requireWorkspaceRole(request, workspaceId, ADMIN_ROLES)
  if (!access.membership) return NextResponse.json({ error: access.error }, { status: access.status })
  const limit = await rateLimit(request, { name: 'invite-create', identifier: workspaceId, limit: 20, windowMs: 60 * 60_000 })
  if (!limit.allowed) return NextResponse.json({ error: 'Too many invites. Try again later.' }, { status: 429, headers: rateLimitHeaders(limit) })
  let idem: Awaited<ReturnType<typeof beginRouteIdempotency>> | null = null
  try {
    const body = (await request.json()) as Record<string, unknown>
    const email = normalizeEmail(String(body.email ?? ''))
    const parsedRole = inviteRoleSchema.safeParse(String(body.role ?? 'viewer'))
    if (!parsedRole.success) return NextResponse.json({ error: 'Invalid invite role' }, { status: 400 })
    const role = parsedRole.data
    if (role === 'admin' && access.membership.role !== 'owner') return NextResponse.json({ error: 'Only the owner can invite admins' }, { status: 403 })
    // A retried invite with the same Idempotency-Key must not rotate the token or resend the email.
    idem = await beginRouteIdempotency(request, access.membership.userId, { workspaceId, email, role })
    if (idem.invalid) return NextResponse.json({ error: idem.invalid }, { status: 400 })
    if (idem.replay) return idem.replay as NextResponse
    const existing = await prisma.membership.findFirst({ where: { workspaceId, user: { email } } })
    if (existing) {
      await releaseRouteIdempotency(idem)
      return NextResponse.json({ error: 'That user is already a member' }, { status: 409 })
    }
    const token = createInviteToken()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const invite = await prisma.workspaceInvite.upsert({ where: { workspaceId_email: { workspaceId, email } }, update: { role: role as never, tokenHash: hashInviteToken(token), expiresAt, acceptedAt: null, revokedAt: null, createdById: access.membership.userId }, create: { workspaceId, email, role: role as never, tokenHash: hashInviteToken(token), expiresAt, createdById: access.membership.userId } })
    await recordAudit(request, { action: 'workspace.invite.create', resourceType: 'workspace_invite', resourceId: invite.id, actorUserId: access.membership.userId, metadata: { workspaceId, email, role, expiresAt } })
    // Best-effort email delivery; the raw token is still returned so the
    // admin can share the link manually if no provider is configured.
    const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || new URL(request.url).origin).replace(/\/$/, '')
    const inviteUrl = `${baseUrl}/account?invite=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`
    await sendEmail(renderWorkspaceInviteEmail({ workspaceName: access.membership.workspace.name, role, inviteUrl, invitedEmail: email }))
    // The raw token is returned once; replays get the same invite without re-exposing it.
    await storeRouteIdempotency(request, idem, 201, { id: invite.id, email, role, expiresAt })
    return NextResponse.json({ id: invite.id, email, role, expiresAt, token }, { status: 201 })
  } catch (error) {
    if (idem) await releaseRouteIdempotency(idem)
    const message = error instanceof Error ? error.message : ''
    if (message.startsWith('Enter a valid email')) {
      return NextResponse.json({ error: message }, { status: 400 })
    }
    console.error('Invite creation failed:', error)
    return NextResponse.json({ error: 'Could not create invite' }, { status: 500 })
  }
}

/** DELETE /api/workspaces/[workspaceId]/invites?id=<inviteId> — revoke a pending invite. */
export async function DELETE(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await context.params
  const access = await requireWorkspaceRole(request, workspaceId, ADMIN_ROLES)
  if (!access.membership) return NextResponse.json({ error: access.error }, { status: access.status })
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Invite id is required' }, { status: 400 })
  const result = await prisma.workspaceInvite.updateMany({
    where: { id, workspaceId, acceptedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  if (!result.count) return NextResponse.json({ error: 'Pending invite not found' }, { status: 404 })
  await recordAudit(request, { action: 'workspace.invite.revoke', resourceType: 'workspace_invite', resourceId: id, actorUserId: access.membership.userId, metadata: { workspaceId } })
  return NextResponse.json({ revoked: true })
}
