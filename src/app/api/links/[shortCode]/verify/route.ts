import { NextRequest, NextResponse } from 'next/server'
import { getLinkByCode } from '@/lib/link-cache'
import crypto from 'node:crypto'
import { createHmac } from 'node:crypto'
import { verifyGatePassword } from '@/lib/password-gate'
import { rateLimit } from '@/lib/rate-limit'

function getSecret(): string { 
  const secret = process.env.QL_ATTRIBUTION_SECRET; 
  if (!secret || secret.length < 32) throw new Error('QL_ATTRIBUTION_SECRET must be at least 32 characters'); 
  return secret;
}

export async function POST(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  const { shortCode } = await context.params
  try {
    const limit = await rateLimit(request, { name: `password:${shortCode}`, limit: 10, windowMs: 5 * 60_000 })
    if (!limit.allowed) {
      return NextResponse.json({ error: 'Too many password attempts. Try again later.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } })
    }
    const { password } = await request.json()
    if (!password) return NextResponse.json({ error: 'Password required' }, { status: 400 })

    const url = await getLinkByCode(shortCode)
    if (!url || !url.passwordHash) {
      return NextResponse.json({ error: 'Not password protected' }, { status: 400 })
    }

    if (!verifyGatePassword(String(password), url.passwordHash)) {
      return NextResponse.json({ error: 'Incorrect password' }, { status: 401 })
    }

    // Generate token
    const token = createHmac('sha256', getSecret()).update(`unlock:${shortCode}`).digest('hex')
    
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
