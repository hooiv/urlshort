import { classifyApiKey } from '@/lib/api-key-health'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import { createApiKey, parseApiKeyExpiry } from '@/lib/api-keys'
import { parseAllowlist } from '@/lib/ip-allowlist'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'

/** GET /api/account/api-keys — list the current user's keys (no secrets). */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request)
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const keys = await prisma.apiKey.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, prefix: true, scopes: true, lastUsedAt: true, revokedAt: true, expiresAt: true, allowedIps: true, createdAt: true },
  })
  const now = new Date()
  return NextResponse.json(keys.map((k) => ({ ...k, health: classifyApiKey(k, now) })))
}

/** POST /api/account/api-keys — create a key. The raw key is returned once. */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request)
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const limit = await rateLimit(request, { name: 'apikey-create', limit: 10, windowMs: 60 * 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many key operations' }, { status: 429, headers: rateLimitHeaders(limit) })

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : ''
    const allowedScopes = new Set(['links:read','links:write','analytics:read','campaigns:write','webhooks:write','*'])
    const scopes = Array.isArray(body.scopes) ? body.scopes.filter((v): v is string => typeof v === 'string' && allowedScopes.has(v)) : ['*']
    if (!scopes.length || scopes.length !== (Array.isArray(body.scopes) ? body.scopes.length : scopes.length)) return NextResponse.json({ error: 'Invalid API key scopes' }, { status: 400 })
    if (!name) return NextResponse.json({ error: 'Key name is required' }, { status: 400 })

    const expiresAt = parseApiKeyExpiry(body.expiresInDays)
    if (expiresAt === null) return NextResponse.json({ error: 'expiresInDays must be an integer from 1 to 730' }, { status: 400 })

    const allowedIps = parseAllowlist(body.allowedIps)
    if (allowedIps === null) return NextResponse.json({ error: 'allowedIps must be up to 20 valid IPs or CIDR ranges' }, { status: 400 })

    const activeCount = await prisma.apiKey.count({ where: { userId: user.id, revokedAt: null } })
    if (activeCount >= 20) return NextResponse.json({ error: 'Maximum of 20 active API keys reached' }, { status: 409 })

    const { key, keyHash, prefix } = createApiKey()
    const created = await prisma.apiKey.create({
      data: { userId: user.id, name, keyHash, prefix, scopes: scopes.join(','), expiresAt, allowedIps },
      select: { id: true, name: true, prefix: true, scopes: true, expiresAt: true, allowedIps: true, createdAt: true },
    })
    await recordAudit(request, { action: 'api_key.create', resourceType: 'api_key', resourceId: created.id, actorUserId: user.id, after: { name, prefix, expiresAt: expiresAt?.toISOString() ?? null, allowedIps } })
    // The raw key is shown exactly once — only its hash is stored.
    return NextResponse.json({ ...created, key }, { status: 201 })
  } catch (error) {
    console.error('API key creation failed:', error)
    return NextResponse.json({ error: 'Could not create API key' }, { status: 500 })
  }
}

/** DELETE /api/account/api-keys?id=<keyId> — revoke a key. */
export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser(request)
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Key id is required' }, { status: 400 })
  const result = await prisma.apiKey.updateMany({ where: { id, userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } })
  if (!result.count) return NextResponse.json({ error: 'Key not found' }, { status: 404 })
  await recordAudit(request, { action: 'api_key.revoke', resourceType: 'api_key', resourceId: id, actorUserId: user.id })
  return NextResponse.json({ revoked: true })
}


/** PATCH /api/account/api-keys — update a key's IP allowlist: { id, allowedIps: string[] } (empty clears). */
export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser(request)
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  if (typeof body.id !== 'string' || !body.id) return NextResponse.json({ error: 'Key id is required' }, { status: 400 })
  const allowedIps = parseAllowlist(body.allowedIps)
  if (allowedIps === null) return NextResponse.json({ error: 'allowedIps must be up to 20 valid IPs or CIDR ranges' }, { status: 400 })
  const result = await prisma.apiKey.updateMany({ where: { id: body.id, userId: user.id, revokedAt: null }, data: { allowedIps } })
  if (!result.count) return NextResponse.json({ error: 'Key not found' }, { status: 404 })
  await recordAudit(request, { action: 'api_key.update', resourceType: 'api_key', resourceId: body.id, actorUserId: user.id, after: { allowedIps } })
  return NextResponse.json({ id: body.id, allowedIps })
}
