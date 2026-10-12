import { NextRequest, NextResponse } from 'next/server'
import { getManageableUrl } from '@/lib/authorization'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { recordAudit } from '@/lib/audit'
import { disablePublicStats, enablePublicStats } from '@/lib/public-stats'

type Ctx = { params: Promise<{ shortCode: string }> }

/** GET → whether a public stats page is enabled (never reveals the token). */
export async function GET(request: NextRequest, context: Ctx) {
  const { shortCode } = await context.params
  const access = await getManageableUrl(request, shortCode)
  if (!access.url) return NextResponse.json({ error: access.error }, { status: access.status })
  return NextResponse.json({ enabled: Boolean(access.url.publicStatsHash), enabledAt: access.url.publicStatsEnabledAt })
}

/** POST → enable or rotate. The token and share path are returned once. */
export async function POST(request: NextRequest, context: Ctx) {
  const { shortCode } = await context.params
  const access = await getManageableUrl(request, shortCode)
  if (!access.url) return NextResponse.json({ error: access.error }, { status: access.status })
  const limit = await rateLimit(request, { name: 'public-stats-manage', identifier: access.url.id, limit: 10, windowMs: 60_000 })
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })
  const rotated = Boolean(access.url.publicStatsHash)
  const { token, enabledAt } = await enablePublicStats(access.url.id)
  await recordAudit(request, { action: rotated ? 'link.public_stats.rotated' : 'link.public_stats.enabled', urlId: access.url.id, resourceType: 'url', resourceId: access.url.id })
  return NextResponse.json({ enabled: true, enabledAt, token, path: `/stats/${token}`, apiPath: `/api/public-stats/${token}` }, { status: rotated ? 200 : 201, headers: { 'Cache-Control': 'no-store' } })
}

/** DELETE → revoke the share link immediately. */
export async function DELETE(request: NextRequest, context: Ctx) {
  const { shortCode } = await context.params
  const access = await getManageableUrl(request, shortCode)
  if (!access.url) return NextResponse.json({ error: access.error }, { status: access.status })
  await disablePublicStats(access.url.id)
  await recordAudit(request, { action: 'link.public_stats.disabled', urlId: access.url.id, resourceType: 'url', resourceId: access.url.id })
  return NextResponse.json({ enabled: false })
}
