import { NextRequest, NextResponse } from 'next/server'
import { createSession, normalizeEmail, setSessionCookie, verifyPassword } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  try {
    // Brute-force protection: per-IP and per-account throttles.
    const ipLimit = await rateLimit(request, { name: 'login:ip', limit: 10, windowMs: 5 * 60_000 })
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many sign-in attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(ipLimit.retryAfterSeconds) } },
      )
    }

    const body = (await request.json()) as Record<string, unknown>
    const email = normalizeEmail(String(body.email ?? ''))
    const accountLimit = await rateLimit(request, { name: 'login:account', identifier: email, limit: 5, windowMs: 5 * 60_000 })
    if (!accountLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many sign-in attempts for this account. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(accountLimit.retryAfterSeconds) } },
      )
    }

    const password = String(body.password ?? '')
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user || !(await verifyPassword(password, user.password))) return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    const session = await createSession(user.id, request.headers.get('user-agent'))
    const mobile = request.headers.get('x-mobile-client') === '1'
    const response = NextResponse.json({ user: { id: user.id, email: user.email, name: user.name }, ...(mobile ? { token: session.token, expiresAt: session.expiresAt } : {}) })
    setSessionCookie(response, session.token, session.expiresAt)
    await recordAudit(request, { action: 'auth.login', resourceType: 'user', resourceId: user.id, actorUserId: user.id, sessionId: session.id, metadata: { method: 'password' } })
    return response
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not sign in' }, { status: 400 })
  }
}

