import { NextRequest, NextResponse } from 'next/server'
import { getLinkByCode } from '@/lib/link-cache'
import crypto from 'node:crypto'
import { createHmac } from 'node:crypto'

function getSecret(): string { 
  const secret = process.env.QL_ATTRIBUTION_SECRET; 
  if (!secret || secret.length < 32) throw new Error('QL_ATTRIBUTION_SECRET must be at least 32 characters'); 
  return secret;
}

export async function POST(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  const { shortCode } = await context.params
  try {
    const { password } = await request.json()
    if (!password) return NextResponse.json({ error: 'Password required' }, { status: 400 })

    const url = await getLinkByCode(shortCode)
    if (!url || !url.passwordHash) {
      return NextResponse.json({ error: 'Not password protected' }, { status: 400 })
    }

    const hash = crypto.scryptSync(String(password), 'ql_salt', 64).toString('hex')
    if (hash !== url.passwordHash) {
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
