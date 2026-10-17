import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, verifyPassword } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { beginTotpSetup, disableTotp, enableTotp, mfaStatus, regenerateRecoveryCodes, verifySecondFactor } from '@/lib/mfa'

/** GET: status. POST {action: setup|enable|disable|recovery} — session only (never API keys). */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request)
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  return NextResponse.json(await mfaStatus(user.id))
}

export async function POST(request: NextRequest) {
  try {
    const limit = await rateLimit(request, { name: 'mfa-manage', limit: 10, windowMs: 15 * 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429, headers: rateLimitHeaders(limit) })
    const user = await getCurrentUser(request)
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    const body = (await request.json()) as Record<string, unknown>
    const action = String(body.action ?? '')
    const code = String(body.code ?? '')
    const password = String(body.password ?? '')
    const audit = (a: string) => recordAudit(request, { action: a, resourceType: 'user', resourceId: user.id, actorUserId: user.id })

    if (action === 'setup') {
      if (!(await verifyPassword(password, user.password))) return NextResponse.json({ error: 'Password is incorrect' }, { status: 403 })
      if ((await mfaStatus(user.id)).enabled) return NextResponse.json({ error: 'Two-factor authentication is already enabled' }, { status: 409 })
      return NextResponse.json(await beginTotpSetup(user.id, user.email))
    }
    if (action === 'enable') {
      const codes = await enableTotp(user.id, code)
      if (!codes) return NextResponse.json({ error: 'Invalid code, or setup was not started' }, { status: 400 })
      await audit('auth.mfa_enable')
      return NextResponse.json({ enabled: true, recoveryCodes: codes })
    }
    if (action === 'disable' || action === 'recovery') {
      if (!(await verifyPassword(password, user.password))) return NextResponse.json({ error: 'Password is incorrect' }, { status: 403 })
      if (!(await verifySecondFactor(user.id, code))) return NextResponse.json({ error: 'Invalid authentication code' }, { status: 403 })
      if (action === 'disable') {
        await disableTotp(user.id)
        await audit('auth.mfa_disable')
        return NextResponse.json({ enabled: false })
      }
      const codes = await regenerateRecoveryCodes(user.id)
      await audit('auth.mfa_recovery_regenerate')
      return NextResponse.json({ recoveryCodes: codes })
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('MFA action failed:', error)
    return NextResponse.json({ error: 'Could not update two-factor settings' }, { status: 500 })
  }
}
