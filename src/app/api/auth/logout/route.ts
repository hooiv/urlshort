import { NextRequest, NextResponse } from 'next/server'
import { clearSessionCookie, getCurrentSession, revokeCurrentSession } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'

export async function POST(request: NextRequest) {
  const session = await getCurrentSession(request)
  if (session) await recordAudit(request, { action: 'auth.logout', resourceType: 'user', resourceId: session.user.id, actorUserId: session.user.id, sessionId: session.id })
  await revokeCurrentSession(request)
  const response = NextResponse.json({ ok: true })
  clearSessionCookie(response)
  return response
}
