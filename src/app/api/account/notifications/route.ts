import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { parseAutoArchiveDays } from '@/lib/auto-archive'

/** GET/PATCH /api/account/notifications — session-only email preferences (weekly performance digest). */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request)
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { weeklyDigest: true, milestoneAlerts: true, autoArchiveStaleDays: true, weeklyDigestSentAt: true, emailVerifiedAt: true } })
  return NextResponse.json({ weeklyDigest: row?.weeklyDigest ?? false, milestoneAlerts: row?.milestoneAlerts ?? false, autoArchiveStaleDays: row?.autoArchiveStaleDays ?? null, lastSentAt: row?.weeklyDigestSentAt ?? null, emailVerified: !!row?.emailVerifiedAt })
}

export async function PATCH(request: NextRequest) {
  const limit = await rateLimit(request, { name: 'account-notifications', limit: 30, windowMs: 60_000 })
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })
  const user = await getCurrentUser(request)
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const hasDigest = body !== null && 'weeklyDigest' in body
  const hasMilestones = body !== null && 'milestoneAlerts' in body
  const hasArchive = body !== null && 'autoArchiveStaleDays' in body
  if (!body || (!hasDigest && !hasMilestones && !hasArchive)) return NextResponse.json({ error: 'Provide weeklyDigest, milestoneAlerts or autoArchiveStaleDays' }, { status: 400 })
  const archiveDays = hasArchive ? parseAutoArchiveDays(body.autoArchiveStaleDays) : undefined
  if (hasArchive && archiveDays === undefined) return NextResponse.json({ error: 'autoArchiveStaleDays must be null or one of 30, 60, 90, 180, 365' }, { status: 400 })
  if (hasDigest && typeof body.weeklyDigest !== 'boolean') return NextResponse.json({ error: 'weeklyDigest must be a boolean' }, { status: 400 })
  if (hasMilestones && typeof body.milestoneAlerts !== 'boolean') return NextResponse.json({ error: 'milestoneAlerts must be a boolean' }, { status: 400 })
  if ((body.weeklyDigest === true || body.milestoneAlerts === true) && !user.emailVerifiedAt) return NextResponse.json({ error: 'Verify your email address before enabling email notifications' }, { status: 409 })
  const data: { weeklyDigest?: boolean; milestoneAlerts?: boolean; autoArchiveStaleDays?: number | null } = {}
  if (hasDigest) data.weeklyDigest = body.weeklyDigest as boolean
  if (hasMilestones) data.milestoneAlerts = body.milestoneAlerts as boolean
  if (hasArchive) data.autoArchiveStaleDays = archiveDays as number | null
  await prisma.user.update({ where: { id: user.id }, data })
  if (hasDigest) await recordAudit(request, { action: data.weeklyDigest ? 'account.weekly_digest.enable' : 'account.weekly_digest.disable', resourceType: 'user', resourceId: user.id, actorUserId: user.id })
  if (hasMilestones) await recordAudit(request, { action: data.milestoneAlerts ? 'account.milestone_alerts.enable' : 'account.milestone_alerts.disable', resourceType: 'user', resourceId: user.id, actorUserId: user.id })
  if (hasArchive) await recordAudit(request, { action: 'account.auto_archive.update', resourceType: 'user', resourceId: user.id, actorUserId: user.id, after: { autoArchiveStaleDays: data.autoArchiveStaleDays } })
  return NextResponse.json(data)
}
