import { NextRequest, NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const current = await getCurrentSession(request)
  if (!current) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const sessions = await prisma.session.findMany({ where: { userId: current.user.id, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: 'desc' }, select: { id: true, userAgent: true, createdAt: true, lastSeenAt: true, expiresAt: true } })
  return NextResponse.json(sessions.map((session) => ({ ...session, current: session.id === current.id })))
}

export async function DELETE(request: NextRequest) {
  const current = await getCurrentSession(request)
  if (!current) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  try {
    const body = (await request.json()) as Record<string, unknown>
    const targetId = typeof body.sessionId === 'string' ? body.sessionId : null
    if (targetId) {
      if (targetId === current.id) return NextResponse.json({ error: 'Use sign out to revoke the current session' }, { status: 400 })
      const result = await prisma.session.updateMany({ where: { id: targetId, userId: current.user.id, revokedAt: null }, data: { revokedAt: new Date() } })
      if (!result.count) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
      await recordAudit(request, { action: 'auth.session.revoke', resourceType: 'session', resourceId: targetId, actorUserId: current.user.id, sessionId: current.id })
      return NextResponse.json({ ok: true })
    }
    const result = await prisma.session.updateMany({ where: { userId: current.user.id, id: { not: current.id }, revokedAt: null }, data: { revokedAt: new Date() } })
    await recordAudit(request, { action: 'auth.sessions.revoke_others', resourceType: 'user', resourceId: current.user.id, actorUserId: current.user.id, sessionId: current.id, metadata: { revoked: result.count } })
    return NextResponse.json({ ok: true, revoked: result.count })
  } catch { return NextResponse.json({ error: 'Could not revoke sessions' }, { status: 400 }) }
}
