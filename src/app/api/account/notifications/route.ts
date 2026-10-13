import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import { rateLimit } from '@/lib/rate-limit'

/** GET/PATCH /api/account/notifications — session-only email preferences (weekly performance digest). */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request)
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { weeklyDigest: true, milestoneAlerts: true, weeklyDigestSentAt: true, emailVerifiedAt: true } })
  return NextResponse.json({ weeklyDigest: row?.weeklyDigest ?? false, milestoneAlerts: row?.milestoneAlerts ?? false, lastSentAt: row?.weeklyDigestSentAt ?? null, emailVerified: !!row?.emailVerifiedAt })
}

export async function PATCH(request: NextRequest) {
  const limit = await rateLimit(request, { name: 'account-notifications', limit: 30, windowMs: 60_000 })
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } })
  const user = await getCurrentUser(request)
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const hasDigest = body !== null && 'weeklyDigest' in body
  const hasMilestones = body !== null && 'milestoneAlerts' in body
  if (!body || (!hasDigest && !hasMilestones)) return NextResponse.json({ error: 'Provide weeklyDigest or milestoneAlerts' }, { status: 400 })
  if (hasDigest && typeof body.weeklyDigest !== 'boolean') return NextResponse.json({ error: 'weeklyDigest must be a boolean' }, { status: 400 })
  if (hasMilestones && typeof body.milestoneAlerts !== 'boolean') return NextResponse.json({ error: 'milestoneAlerts must be a boolean' }, { status: 400 })
  if ((body.weeklyDigest === true || body.milestoneAlerts === true) && !user.emailVerifiedAt) return NextResponse.json({ error: 'Verify your email address before enabling email notifications' }, { status: 409 })
  const data: { weeklyDigest?: boolean; milestoneAlerts?: boolean } = {}
  if (hasDigest) data.weeklyDigest = body.weeklyDigest as boolean
  if (hasMilestones) data.milestoneAlerts = body.milestoneAlerts as boolean
  await prisma.user.update({ where: { id: user.id }, data })
  if (hasDigest) await recordAudit(request, { action: data.weeklyDigest ? 'account.weekly_digest.enable' : 'account.weekly_digest.disable', resourceType: 'user', resourceId: user.id, actorUserId: user.id })
  if (hasMilestones) await recordAudit(request, { action: data.milestoneAlerts ? 'account.milestone_alerts.enable' : 'account.milestone_alerts.disable', resourceType: 'user', resourceId: user.id, actorUserId: user.id })
  return NextResponse.json(data)
}
