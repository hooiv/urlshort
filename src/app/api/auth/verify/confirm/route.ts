import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'

/**
 * POST /api/auth/verify/confirm — consume an email verification token.
 * Single-use; expired or used tokens return 410.
 */
export async function POST(request: NextRequest) {
  try {
    const limit = await rateLimit(request, { name: 'verify-confirm', limit: 20, windowMs: 60 * 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } })

    const body = (await request.json()) as Record<string, unknown>
    const token = String(body.token ?? '')
    if (!token) return NextResponse.json({ error: 'Verification token is required' }, { status: 400 })

    const record = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: createHash('sha256').update(token).digest('hex') } })
    if (!record || record.usedAt || record.expiresAt <= new Date()) {
      return NextResponse.json({ error: 'This verification link is invalid or has expired' }, { status: 410 })
    }

    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } }),
      prisma.emailVerificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    ])

    return NextResponse.json({ verified: true })
  } catch (error) {
    console.error('Email verification failed:', error)
    return NextResponse.json({ error: 'Could not verify email' }, { status: 500 })
  }
}
