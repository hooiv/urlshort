import { createHash, randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

const COOKIE = 'ql_session'
const SESSION_DAYS = 30

export function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('Enter a valid email address')
  return email
}

export function validatePassword(value: string): string {
  if (value.length < 12 || value.length > 128) throw new Error('Password must be 12–128 characters')
  return value
}

function hashToken(token: string): string { return createHash('sha256').update(token).digest('hex') }

export async function hashPassword(password: string): Promise<string> { return bcrypt.hash(password, 12) }
export async function verifyPassword(password: string, hash: string): Promise<boolean> { return bcrypt.compare(password, hash) }

export async function createSession(userId: string, userAgent: string | null) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  const session = await prisma.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt, userAgent } })
  return { id: session.id, token, expiresAt }
}

export async function getCurrentSession(request: NextRequest) {
  const token = request.cookies.get(COOKIE)?.value
  if (!token) return null
  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } })
  if (!session || session.revokedAt || session.expiresAt <= new Date()) return null
  // Throttle lastSeenAt writes: only update if the last write is >5 min old,
  // avoiding a DB write on every authenticated request.
  if (Date.now() - session.lastSeenAt.getTime() > 5 * 60_000) {
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {})
  }
  return session
}

export async function getCurrentUser(request: NextRequest) {
  const session = await getCurrentSession(request)
  return session?.user ?? null
}

export function setSessionCookie(response: Response, token: string, expiresAt: Date) {
  const secure = process.env.NODE_ENV === 'production'
  response.headers.append('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor((expiresAt.getTime() - Date.now()) / 1000)}${secure ? '; Secure' : ''}`)
}

export function clearSessionCookie(response: Response) {
  response.headers.append('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
}

export async function revokeCurrentSession(request: NextRequest) {
  const token = request.cookies.get(COOKIE)?.value
  if (!token) return
  await prisma.session.updateMany({ where: { tokenHash: hashToken(token), revokedAt: null }, data: { revokedAt: new Date() } })
}
