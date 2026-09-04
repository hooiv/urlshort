import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyAttributionToken } from '@/lib/attribution'
import { rateLimit } from '@/lib/rate-limit'
import { enforceUsage } from '@/lib/tenant-usage'
import { getPrivacyPolicy, sanitizeAnalyticsMetadata, hashWithWorkspace } from '@/lib/privacy-ingestion'
import { dispatchWebhooksForUrl } from '@/lib/webhooks'

/**
 * CORS for the public conversion endpoint. The attribution token travels in the
 * destination page's URL fragment, so any destination site can read it — the
 * allowlist limits which origins may *submit* conversions. Set
 * TRACK_ALLOWED_ORIGINS (comma-separated) to restrict; `*` keeps legacy
 * open-submission behavior for self-hosted installs.
 */
function corsHeaders(origin: string | null): Record<string, string> {
  const configured = (process.env.TRACK_ALLOWED_ORIGINS || '*').split(',').map((value) => value.trim()).filter(Boolean)
  const allowAll = configured.includes('*')
  const allowed = allowAll || (origin && configured.includes(origin))
  return {
    'Access-Control-Allow-Origin': allowed ? (allowAll ? '*' : origin as string) : configured[0] || 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

// Replay window: a token is single-use per visitor+goal within 24h (was 60s,
// which allowed trivial conversion inflation by replaying after a minute).
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000

function dateKey(date: Date): string { return date.toISOString().slice(0, 10) }
export { dateKey }
export async function OPTIONS(request: NextRequest) { return new NextResponse(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) }) }
export async function POST(request: NextRequest) {
  try {
    const limit = await rateLimit(request, { name: 'track', limit: 60, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { ...corsHeaders(request.headers.get('origin')), 'Retry-After': String(limit.retryAfterSeconds) } })

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    const origin = request.headers.get('origin')
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid request body' }, { status: 400, headers: corsHeaders(origin) })
    const attributionToken = typeof body.attributionToken === 'string' ? body.attributionToken : ''
    const eventKey = typeof body.eventKey === 'string' ? body.eventKey.trim() : ''
    const valueCents = body.valueCents == null ? null : Number(body.valueCents)
    const currency = body.currency == null ? null : String(body.currency).trim().toUpperCase()
    const metadata = body.metadata === undefined ? null : body.metadata
    if (!attributionToken || !eventKey) return NextResponse.json({ error: 'attributionToken and eventKey are required' }, { status: 400, headers: corsHeaders(origin) })
    if (!/^[a-z0-9_]{1,64}$/.test(eventKey)) return NextResponse.json({ error: 'Invalid event key' }, { status: 400, headers: corsHeaders(origin) })
    if (valueCents !== null && (!Number.isInteger(valueCents) || valueCents < 0 || valueCents > 100_000_000)) return NextResponse.json({ error: 'valueCents must be a non-negative integer' }, { status: 400, headers: corsHeaders(origin) })
    if (currency !== null && !/^[A-Z]{3}$/.test(currency)) return NextResponse.json({ error: 'Currency must be a 3-letter code' }, { status: 400, headers: corsHeaders(origin) })
    let safeMetadata: string | null = null
    if (metadata !== null) { if (typeof metadata !== 'object' || Array.isArray(metadata)) return NextResponse.json({ error: 'metadata must be an object' }, { status: 400, headers: corsHeaders(origin) }); const serialized = JSON.stringify(metadata); if (serialized.length > 4000) return NextResponse.json({ error: 'metadata is too large' }, { status: 400, headers: corsHeaders(origin) }); safeMetadata = serialized }
    const payload = verifyAttributionToken(attributionToken)
    if (!payload) return NextResponse.json({ error: 'Invalid or expired attribution token' }, { status: 401, headers: corsHeaders(origin) })
    const goal = await prisma.goal.findFirst({ where: { urlId: payload.urlId, eventKey, enabled: true } })
    if (!goal) return NextResponse.json({ error: 'Unknown conversion goal' }, { status: 404, headers: corsHeaders(origin) })
    const click = await prisma.clickEvent.findFirst({ where: { id: payload.clickEventId, urlId: payload.urlId } })
    if (!click) return NextResponse.json({ error: 'Attribution click not found' }, { status: 404, headers: corsHeaders(origin) })
    const owner = await prisma.url.findUnique({ where: { id: payload.urlId }, select: { workspaceId: true } })
    let storedVisitorId: string | null = payload.visitorIdHash; if (owner?.workspaceId) { const policy = await getPrivacyPolicy(owner.workspaceId); if (policy.aggregateOnly || !policy.hashVisitor) storedVisitorId = null; else if (policy.hashVisitor) storedVisitorId = hashWithWorkspace(payload.visitorIdHash, owner.workspaceId); const usage = await enforceUsage(request, owner.workspaceId, 'conversions'); if (!usage.allowed) return NextResponse.json({ error: 'Conversion quota exceeded' }, { status: 429, headers: corsHeaders(origin) }); const safe = await sanitizeAnalyticsMetadata(owner.workspaceId, metadata && typeof metadata === 'object' ? metadata as Record<string,unknown> : {}); safeMetadata = Object.keys(safe).length ? JSON.stringify(safe) : null }
    const duplicate = await prisma.conversionEvent.findFirst({ where: { goalId: goal.id, visitorIdHash: storedVisitorId, createdAt: { gte: new Date(Date.now() - DEDUP_WINDOW_MS) } }, select: { id: true } })
    if (duplicate) return NextResponse.json({ accepted: true, duplicate: true }, { status: 202, headers: corsHeaders(origin) })
    const now = new Date()
    const conversion = await prisma.$transaction(async (tx) => {
      const created = await tx.conversionEvent.create({ data: { urlId: payload.urlId, goalId: goal.id, clickEventId: click.id, ruleId: click.ruleId, visitorIdHash: storedVisitorId, valueCents, currency, metadata: safeMetadata } })
      await tx.conversionDaily.upsert({ where: { goalId_dateKey: { goalId: goal.id, dateKey: dateKey(now) } }, create: { goalId: goal.id, dateKey: dateKey(now), conversions: 1, valueCents: valueCents ?? 0 }, update: { conversions: { increment: 1 }, valueCents: { increment: valueCents ?? 0 } } })
      return created
    })
    await dispatchWebhooksForUrl(payload.urlId, 'conversion.recorded', { id: conversion.id, urlId: payload.urlId, goalId: goal.id, valueCents, currency, occurredAt: now.toISOString() })
    return NextResponse.json({ accepted: true, id: conversion.id }, { status: 201, headers: corsHeaders(origin) })
  } catch (error) { console.error('Conversion tracking failed:', error); return NextResponse.json({ error: 'Unable to record conversion' }, { status: 500, headers: corsHeaders(origin) }) }
}
