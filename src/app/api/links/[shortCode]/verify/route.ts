import { NextRequest, NextResponse } from 'next/server'
import { getLinkByCode } from '@/lib/link-cache'
import { createUnlockToken, verifyGatePassword } from '@/lib/password-gate'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'

const MAX_LINK_ATTEMPTS = 60
const MAX_PASSWORD_LENGTH = 256

export async function POST(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  const { shortCode } = await context.params
  try {
    const limit = await rateLimit(request, { name: `password:${shortCode}`, limit: 10, windowMs: 5 * 60_000 })
    if (!limit.allowed) {
      return NextResponse.json({ error: 'Too many password attempts. Try again later.' }, { status: 429, headers: rateLimitHeaders(limit) })
    }
    // Distributed guessing (many IPs, one link) bypasses the per-IP budget, so
    // every link also has a shared attempt budget across all clients.
    const linkLimit = await rateLimit(request, { name: 'password-link', limit: MAX_LINK_ATTEMPTS, windowMs: 10 * 60_000, identifier: shortCode })
    if (!linkLimit.allowed) {
      return NextResponse.json({ error: 'Too many password attempts for this link. Try again later.' }, { status: 429, headers: rateLimitHeaders(linkLimit) })
    }
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const password = (body as { password?: unknown } | null)?.password
    if (typeof password !== 'string' || !password) return NextResponse.json({ error: 'Password required' }, { status: 400 })
    // scrypt is deliberately expensive; cap input size so it cannot be used for CPU exhaustion.
    if (password.length > MAX_PASSWORD_LENGTH) return NextResponse.json({ error: 'Password too long' }, { status: 400 })

    const url = await getLinkByCode(shortCode)
    if (!url || !url.passwordHash) {
      return NextResponse.json({ error: 'Not password protected' }, { status: 400 })
    }

    if (!verifyGatePassword(password, url.passwordHash)) {
      return NextResponse.json({ error: 'Incorrect password' }, { status: 401 })
    }

    // Generate token
    const token = createUnlockToken(shortCode, url.passwordHash)
    
    const response = NextResponse.json({ success: true })
    response.cookies.set(`ql_unlocked_${shortCode}`, token, { 
      httpOnly: true, 
      sameSite: 'lax', 
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/' 
    })
    return response
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
