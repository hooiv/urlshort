import { createHash, randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { normalizeEmail } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { renderPasswordResetEmail, sendEmail } from '@/lib/email'

const RESET_TTL_MS = 60 * 60_000 // 1 hour

/**
 * POST /api/auth/reset — request a password reset.
 *
 * Always returns 200 (no account enumeration). The reset link is delivered via
 * the configured transport: in development without an email provider it is
 * logged to the server console; production deployments should integrate an
 * email service and set PASSWORD_RESET_DELIVERY=smtp|resend (see README).
 */
export async function POST(request: NextRequest) {
  try {
    const limit = await rateLimit(request, { name: 'reset-request', limit: 5, windowMs: 60 * 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } })

    const body = (await request.json()) as Record<string, unknown>
    const email = normalizeEmail(String(body.email ?? ''))

    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } })
    if (user) {
      // Invalidate outstanding tokens for this user, then issue a fresh one.
      await prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } })
      const token = randomBytes(32).toString('base64url')
      await prisma.passwordResetToken.create({
        data: { tokenHash: createHash('sha256').update(token).digest('hex'), userId: user.id, expiresAt: new Date(Date.now() + RESET_TTL_MS) },
      })

      const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || new URL(request.url).origin).replace(/\/$/, '')
      const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`
      const message = renderPasswordResetEmail({ resetUrl })
      message.to = email
      await sendEmail(message)
    }

    return NextResponse.json({ sent: true })
  } catch (error) {
    console.error('Password reset request failed:', error)
    return NextResponse.json({ error: 'Could not process the request' }, { status: 500 })
  }
}
