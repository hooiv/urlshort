import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, hashPassword, verifyPassword, validatePassword } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import { rateLimit } from '@/lib/rate-limit'

const SESSION_COOKIE = 'ql_session'

/**
 * POST /api/account/password — change the signed-in user's password.
 * Requires the current password; revokes all other sessions on success so
 * stolen sessions don't survive a credential rotation.
 */
export async function POST(request: NextRequest) {
  try {
    const limit = await rateLimit(request, { name: 'password-change', limit: 5, windowMs: 60 * 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } })

    const user = await getCurrentUser(request)
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const body = (await request.json()) as Record<string, unknown>
    const currentPassword = String(body.currentPassword ?? '')
    const newPassword = validatePassword(String(body.newPassword ?? ''))

    if (!(await verifyPassword(currentPassword, user.password))) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 403 })
    }
    if (await verifyPassword(newPassword, user.password)) {
      return NextResponse.json({ error: 'New password must be different from the current password' }, { status: 400 })
    }

    await prisma.user.update({ where: { id: user.id }, data: { password: await hashPassword(newPassword) } })

    // Keep the current session alive; revoke every other active session.
    const currentToken = request.cookies.get(SESSION_COOKIE)?.value
    const currentTokenHash = currentToken ? createHash('sha256').update(currentToken).digest('hex') : null
    await prisma.session.updateMany({
      where: {
        userId: user.id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        ...(currentTokenHash ? { tokenHash: { not: currentTokenHash } } : {}),
      },
      data: { revokedAt: new Date() },
    })

    await recordAudit(request, { action: 'auth.password_change', resourceType: 'user', resourceId: user.id, actorUserId: user.id })
    return NextResponse.json({ changed: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    // Preserve password-policy messages (safe); hide infra details.
    if (message.startsWith('Password must be')) {
      return NextResponse.json({ error: message }, { status: 400 })
    }
    console.error('Password change failed:', error)
    return NextResponse.json({ error: 'Could not change password' }, { status: 500 })
  }
}
