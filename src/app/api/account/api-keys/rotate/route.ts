import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import { createApiKey, parseRotationGrace, rotatedKeyExpiry } from '@/lib/api-keys'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'

/**
 * POST /api/account/api-keys/rotate { id, graceHours? }
 * Issues a replacement key with identical scopes, allowlist and name, and lets the old
 * key keep working for a grace window (default 24h, max 168h; 0 revokes immediately).
 * The raw new key is returned once. Session auth only.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request)
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    const limit = await rateLimit(request, { name: 'apikey-rotate', limit: 10, windowMs: 60 * 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many key operations' }, { status: 429, headers: rateLimitHeaders(limit) })

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    if (typeof body.id !== 'string' || !body.id) return NextResponse.json({ error: 'Key id is required' }, { status: 400 })
    const graceHours = parseRotationGrace(body.graceHours)
    if (graceHours === null) return NextResponse.json({ error: 'graceHours must be an integer from 0 to 168' }, { status: 400 })

    const now = new Date()
    const old = await prisma.apiKey.findFirst({ where: { id: body.id, userId: user.id, revokedAt: null } })
    if (!old || (old.expiresAt && old.expiresAt <= now)) return NextResponse.json({ error: 'Key not found or no longer active' }, { status: 404 })

    const { key, keyHash, prefix } = createApiKey()
    const oldExpiry = rotatedKeyExpiry(old.expiresAt, graceHours, now)
    const [created] = await prisma.$transaction([
      prisma.apiKey.create({
        data: { userId: user.id, name: old.name, keyHash, prefix, scopes: old.scopes, expiresAt: null, allowedIps: old.allowedIps },
        select: { id: true, name: true, prefix: true, scopes: true, expiresAt: true, allowedIps: true, createdAt: true },
      }),
      prisma.apiKey.update({ where: { id: old.id }, data: graceHours === 0 ? { revokedAt: now } : { expiresAt: oldExpiry } }),
    ])
    await recordAudit(request, { action: 'api_key.rotate', resourceType: 'api_key', resourceId: old.id, actorUserId: user.id, after: { newKeyId: created.id, graceHours, oldKeyExpiresAt: graceHours === 0 ? now.toISOString() : oldExpiry.toISOString() } })
    return NextResponse.json({ ...created, key, rotatedFrom: old.id, previousKeyExpiresAt: graceHours === 0 ? now : oldExpiry }, { status: 201 })
  } catch (error) {
    console.error('API key rotation failed:', error)
    return NextResponse.json({ error: 'Could not rotate API key' }, { status: 500 })
  }
}
