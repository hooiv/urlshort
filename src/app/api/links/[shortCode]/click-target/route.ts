import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getManageableUrl } from '@/lib/authorization'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { evaluateGoal } from '@/lib/link-goals'
import { recordAudit } from '@/lib/audit'

type Ctx = { params: Promise<{ shortCode: string }> }

function view(url: { clicks: number; createdAt: Date; clickTarget: number | null; clickTargetDeadline: Date | null }) {
  if (url.clickTarget == null || !url.clickTargetDeadline) return { target: null, deadline: null, progress: null }
  const progress = evaluateGoal({ target: url.clickTarget, clicks: url.clicks, startedAt: url.createdAt, deadline: url.clickTargetDeadline })
  return { target: url.clickTarget, deadline: url.clickTargetDeadline.toISOString(), progress }
}

const select = { id: true, shortCode: true, clicks: true, createdAt: true, clickTarget: true, clickTargetDeadline: true } as const

/** GET /api/links/:code/click-target: target, deadline and pacing status. */
export async function GET(request: NextRequest, context: Ctx) {
  const { shortCode } = await context.params
  const access = await getManageableUrl(request, shortCode)
  if (!access.url) return NextResponse.json({ error: access.error }, { status: access.status })
  const url = await prisma.url.findUnique({ where: { id: access.url.id }, select })
  if (!url) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(view(url))
}

/** PUT /api/links/:code/click-target { target: int, deadline: ISO date in the future } */
export async function PUT(request: NextRequest, context: Ctx) {
  try {
    const limit = await rateLimit(request, { name: 'link-click-target', limit: 60, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })
    const { shortCode } = await context.params
    const access = await getManageableUrl(request, shortCode)
    if (!access.url) return NextResponse.json({ error: access.error }, { status: access.status })
    let body: { target?: unknown; deadline?: unknown }
    try { body = JSON.parse(await request.text()) } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    const target = body.target
    if (typeof target !== 'number' || !Number.isInteger(target) || target < 1 || target > 1_000_000_000) return NextResponse.json({ error: 'target must be an integer between 1 and 1000000000' }, { status: 400 })
    const deadline = typeof body.deadline === 'string' ? new Date(body.deadline) : null
    if (!deadline || Number.isNaN(deadline.getTime())) return NextResponse.json({ error: 'deadline must be an ISO date' }, { status: 400 })
    if (deadline.getTime() <= Date.now()) return NextResponse.json({ error: 'deadline must be in the future' }, { status: 400 })
    const url = await prisma.url.update({ where: { id: access.url.id }, data: { clickTarget: target, clickTargetDeadline: deadline }, select })
    await recordAudit(request, { action: 'link.click_target.set', urlId: url.id, resourceType: 'url', resourceId: url.id, after: { target, deadline: deadline.toISOString() } })
    return NextResponse.json(view(url))
  } catch (error) {
    console.error('Set click target failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

/** DELETE /api/links/:code/click-target */
export async function DELETE(request: NextRequest, context: Ctx) {
  const { shortCode } = await context.params
  const access = await getManageableUrl(request, shortCode)
  if (!access.url) return NextResponse.json({ error: access.error }, { status: access.status })
  await prisma.url.update({ where: { id: access.url.id }, data: { clickTarget: null, clickTargetDeadline: null } })
  await recordAudit(request, { action: 'link.click_target.clear', urlId: access.url.id, resourceType: 'url', resourceId: access.url.id })
  return NextResponse.json({ target: null, deadline: null, progress: null })
}
