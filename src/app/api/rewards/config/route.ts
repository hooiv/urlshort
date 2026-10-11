import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { LINK_READ_SCOPES, LINK_WRITE_SCOPES, resolveActor } from '@/lib/request-actor'
import { ACCOUNT_SCOPE, canConfigureLink, linkScopeKey } from '@/lib/commissions'
import { findShadowedRules, parseDefault, parseRules } from '@/lib/reward-rules'

type Row = { scopeKey: string; urlId: string | null; rules: string; fallback: string | null; updatedAt: Date; url?: { shortCode: string } | null }
const present = (row: Row) => ({
  scope: row.urlId ? 'link' : 'account',
  urlId: row.urlId,
  shortCode: row.url?.shortCode ?? null,
  rules: JSON.parse(row.rules),
  fallback: row.fallback ? JSON.parse(row.fallback) : null,
  updatedAt: row.updatedAt,
})

async function auth(request: NextRequest, mode: 'read' | 'write') {
  const resolved = mode === 'read' ? await resolveActor(request, LINK_READ_SCOPES) : await resolveActor(request, LINK_WRITE_SCOPES)
  if (!resolved.actor) {
    return { error: NextResponse.json({ error: resolved.error === 'Authentication required' ? 'Unauthorized' : resolved.error }, { status: resolved.status }) }
  }
  return { userId: resolved.actor.userId }
}

/** GET /api/rewards/config — the account default plus every per-link override. */
export async function GET(request: NextRequest) {
  const a = await auth(request, 'read')
  if (a.error) return a.error
  const rows = await prisma.rewardConfig.findMany({ where: { userId: a.userId }, orderBy: { scopeKey: 'asc' }, select: { scopeKey: true, urlId: true, rules: true, fallback: true, updatedAt: true, url: { select: { shortCode: true } } } })
  return NextResponse.json({ configs: rows.map(present) })
}

/**
 * PUT /api/rewards/config { urlId?, rules, fallback } — replace one scope.
 * Omit urlId for the account default. Rules are validated before storage.
 */
export async function PUT(request: NextRequest) {
  const limit = await rateLimit(request, { name: 'rewards-config', limit: 60, windowMs: 60_000 })
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })
  const a = await auth(request, 'write')
  if (a.error) return a.error
  const body = (await request.json().catch(() => null)) as { urlId?: unknown; shortCode?: unknown; rules?: unknown; fallback?: unknown } | null
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  const rules = parseRules(body.rules ?? [])
  if ('error' in rules) return NextResponse.json({ error: rules.error }, { status: 400 })
  const fallback = parseDefault(body.fallback ?? null)
  if ('error' in fallback) return NextResponse.json({ error: fallback.error }, { status: 400 })
  if (rules.rules.length === 0 && !fallback.fallback) return NextResponse.json({ error: 'Provide at least one rule or a default; use DELETE to clear a scope' }, { status: 400 })

  let urlId: string | null = null
  if (typeof body.shortCode === 'string' && body.shortCode && body.urlId == null) {
    const found = await prisma.url.findUnique({ where: { shortCode: body.shortCode }, select: { id: true } })
    if (!found || !(await canConfigureLink(prisma, a.userId, found.id))) return NextResponse.json({ error: 'Link not found' }, { status: 404 })
    urlId = found.id
  } else if (body.urlId !== undefined && body.urlId !== null) {
    if (typeof body.urlId !== 'string' || !body.urlId) return NextResponse.json({ error: 'urlId must be a string' }, { status: 400 })
    if (!(await canConfigureLink(prisma, a.userId, body.urlId))) return NextResponse.json({ error: 'Link not found' }, { status: 404 })
    urlId = body.urlId
  }
  const scopeKey = urlId ? linkScopeKey(urlId) : ACCOUNT_SCOPE
  const data = { rules: JSON.stringify(rules.rules), fallback: fallback.fallback ? JSON.stringify(fallback.fallback) : null }
  const row = await prisma.rewardConfig.upsert({
    where: { userId_scopeKey: { userId: a.userId, scopeKey } },
    create: { userId: a.userId, scopeKey, urlId, ...data },
    update: data,
    select: { scopeKey: true, urlId: true, rules: true, fallback: true, updatedAt: true, url: { select: { shortCode: true } } },
  })
  return NextResponse.json({ ...present(row), shadowed: findShadowedRules(rules.rules) }, { headers: rateLimitHeaders(limit) })
}

/** DELETE /api/rewards/config?urlId= — clear a scope (omit urlId for the account default). Existing commissions are untouched. */
export async function DELETE(request: NextRequest) {
  const a = await auth(request, 'write')
  if (a.error) return a.error
  const urlId = request.nextUrl.searchParams.get('urlId')
  const scopeKey = urlId ? linkScopeKey(urlId) : ACCOUNT_SCOPE
  const res = await prisma.rewardConfig.deleteMany({ where: { userId: a.userId, scopeKey } })
  if (res.count === 0) return NextResponse.json({ error: 'No rewards configured for that scope' }, { status: 404 })
  return NextResponse.json({ deleted: true })
}
