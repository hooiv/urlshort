import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPassword, validatePassword } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'

/**
 * POST /api/auth/reset/confirm — complete a password reset.
 * Consumes the single-use token, updates the password, and revokes every
 * session for the account (a reset means credentials may be compromised).
 */
export async function POST(request: NextRequest) {
  try {
    const limit = await rateLimit(request, { name: 'reset-confirm', limit: 10, windowMs: 60 * 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } })

    const body = (await request.json()) as Record<string, unknown>
    const token = String(body.token ?? '')
    const newPassword = validatePassword(String(body.password ?? ''))
    if (!token) return NextResponse.json({ error: 'Reset token is required' }, { status: 400 })

    const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: createHash('sha256').update(token).digest('hex') } })
    if (!record || record.usedAt || record.expiresAt <= new Date()) {
      return NextResponse.json({ error: 'This reset link is invalid or has expired' }, { status: 410 })
    }

    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { password: await hashPassword(newPassword) } }),
      prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      // Reset implies possible account compromise: sign out everywhere.
      prisma.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ])

    return NextResponse.json({ reset: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not reset password' }, { status: 400 })
  }
}
