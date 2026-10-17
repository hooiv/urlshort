import { NextRequest, NextResponse } from 'next/server'
import { createSession, normalizeEmail, setSessionCookie, verifyPassword } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import { verifySecondFactor } from '@/lib/mfa'
import { prisma } from '@/lib/prisma'
import { deviceFingerprint, notifyIfNewDevice } from '@/lib/login-alerts'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  try {
    // Brute-force protection: per-IP and per-account throttles.
    const ipLimit = await rateLimit(request, { name: 'login:ip', limit: 10, windowMs: 5 * 60_000 })
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many sign-in attempts. Please try again later.' },
        { status: 429, headers: rateLimitHeaders(ipLimit) },
      )
    }

    const body = (await request.json()) as Record<string, unknown>
    const email = normalizeEmail(String(body.email ?? ''))
    const accountLimit = await rateLimit(request, { name: 'login:account', identifier: email, limit: 5, windowMs: 5 * 60_000 })
    if (!accountLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many sign-in attempts for this account. Please try again later.' },
        { status: 429, headers: rateLimitHeaders(accountLimit) },
      )
    }

    const password = String(body.password ?? '')
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user || !(await verifyPassword(password, user.password))) return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    let method = 'password'
    if (user.totpEnabledAt) {
      const code = String(body.code ?? '').trim()
      if (!code) return NextResponse.json({ error: 'Authentication code required', mfaRequired: true }, { status: 401 })
      const factor = await verifySecondFactor(user.id, code)
      if (!factor) {
        await recordAudit(request, { action: 'auth.mfa_failed', resourceType: 'user', resourceId: user.id, actorUserId: user.id })
        return NextResponse.json({ error: 'Invalid authentication code', mfaRequired: true }, { status: 401 })
      }
      method = `password+${factor}`
    }
    const userAgent = request.headers.get('user-agent')
    await notifyIfNewDevice(user, userAgent, request.nextUrl.origin)
    const session = await createSession(user.id, request.headers.get('user-agent'))
    const mobile = request.headers.get('x-mobile-client') === '1'
    const response = NextResponse.json({ user: { id: user.id, email: user.email, name: user.name }, ...(mobile ? { token: session.token, expiresAt: session.expiresAt } : {}) })
    setSessionCookie(response, session.token, session.expiresAt)
    await recordAudit(request, { action: 'auth.login', resourceType: 'user', resourceId: user.id, actorUserId: user.id, sessionId: session.id, metadata: { method, device: deviceFingerprint(userAgent) } })
    return response
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not sign in' }, { status: 400 })
  }
}

