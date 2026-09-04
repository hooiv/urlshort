import { createHash, randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createSession, hashPassword, normalizeEmail, setSessionCookie, validatePassword } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import { slugifyWorkspace } from '@/lib/workspaces'
import { rateLimit } from '@/lib/rate-limit'
import { renderEmailVerificationEmail, sendEmail } from '@/lib/email'

const VERIFY_TTL_MS = 24 * 60 * 60_000

export async function POST(request: NextRequest) {
  try {
    const limit = await rateLimit(request, { name: 'register', limit: 5, windowMs: 60 * 60_000 })
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many accounts created from this network. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
      )
    }

    const body = (await request.json()) as Record<string, unknown>
    const email = normalizeEmail(String(body.email ?? ''))
    const password = validatePassword(String(body.password ?? ''))
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) || null : null
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } })
    if (existing) return NextResponse.json({ error: 'An account already exists for this email' }, { status: 409 })
    const user = await prisma.user.create({ data: { email, name, password: await hashPassword(password) }, select: { id: true, email: true, name: true } })
    const workspaceName = name ? `${name}'s Workspace` : 'My Workspace'
    const workspace = await prisma.workspace.create({ data: { name: workspaceName, slug: slugifyWorkspace(workspaceName), members: { create: { userId: user.id, role: 'owner' } } } })
    const session = await createSession(user.id, request.headers.get('user-agent'))

    // Send the verification email (best-effort; registration never blocks on it).
    try {
      const token = randomBytes(32).toString('base64url')
      await prisma.emailVerificationToken.create({
        data: { tokenHash: createHash('sha256').update(token).digest('hex'), userId: user.id, expiresAt: new Date(Date.now() + VERIFY_TTL_MS) },
      })
      const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || new URL(request.url).origin).replace(/\/$/, '')
      const verifyUrl = `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`
      const message = renderEmailVerificationEmail({ verifyUrl })
      message.to = user.email
      await sendEmail(message)
    } catch (emailError) {
      console.error('Verification email failed after registration:', emailError)
    }

    const response = NextResponse.json({ user, workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug, role: 'owner' } }, { status: 201 })
    setSessionCookie(response, session.token, session.expiresAt)
    await recordAudit(request, { action: 'auth.register', resourceType: 'user', resourceId: user.id, actorUserId: user.id, sessionId: session.id, after: { email: user.email, name: user.name, workspaceId: workspace.id } })
    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    // Preserve input-validation messages (safe); hide infra details.
    if (message.startsWith('Enter a valid email') || message.startsWith('Password must be')) {
      return NextResponse.json({ error: message }, { status: 400 })
    }
    console.error('Registration failed:', error)
    return NextResponse.json({ error: 'Could not create account' }, { status: 500 })
  }
}
