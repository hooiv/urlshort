import { createHash, randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, normalizeEmail } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { renderEmailVerificationEmail, sendEmail } from '@/lib/email'

const VERIFY_TTL_MS = 24 * 60 * 60_000 // 24 hours

/**
 * POST /api/auth/verify — send (or resend) a verification email for the
 * signed-in user. No-op success if already verified. Always 200 to avoid
 * leaking whether an email is registered.
 */
export async function POST(request: NextRequest) {
  try {
    const limit = await rateLimit(request, { name: 'verify-request', limit: 5, windowMs: 60 * 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } })

    const user = await getCurrentUser(request)
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    if (user.emailVerifiedAt) return NextResponse.json({ verified: true })

    await prisma.emailVerificationToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } })
    const token = randomBytes(32).toString('base64url')
    await prisma.emailVerificationToken.create({
      data: { tokenHash: createHash('sha256').update(token).digest('hex'), userId: user.id, expiresAt: new Date(Date.now() + VERIFY_TTL_MS) },
    })

    const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || new URL(request.url).origin).replace(/\/$/, '')
    const verifyUrl = `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`
    const message = renderEmailVerificationEmail({ verifyUrl })
    message.to = user.email
    await sendEmail(message)

    return NextResponse.json({ sent: true })
  } catch (error) {
    console.error('Verification email failed:', error)
    return NextResponse.json({ error: 'Could not send verification email' }, { status: 500 })
  }
}

/** GET /api/auth/verify?email=<address> — check verification status (for UI polling). */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request)
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  void normalizeEmail // keep import used if flow changes
  return NextResponse.json({ verified: Boolean(user.emailVerifiedAt), email: user.email })
}
