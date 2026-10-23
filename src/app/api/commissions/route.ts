import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { LINK_READ_SCOPES, LINK_WRITE_SCOPES, resolveActor } from '@/lib/request-actor'
import { beginRouteIdempotency, releaseRouteIdempotency, storeRouteIdempotency } from '@/lib/idempotency-route'
import { COMMISSION_STATUSES, transitionCommissions } from '@/lib/commissions'
import { assessCommissionRisk } from '@/lib/commission-risk'

const PAGE_SIZE = 50

/** GET /api/commissions?status=&urlId=&cursor= — the owner's commissions with per-status totals. */
export async function GET(request: NextRequest) {
  const resolved = await resolveActor(request, LINK_READ_SCOPES)
  if (!resolved.actor) return NextResponse.json({ error: resolved.error === 'Authentication required' ? 'Unauthorized' : resolved.error }, { status: resolved.status })
  const userId = resolved.actor.userId
  const sp = request.nextUrl.searchParams
  const status = sp.get('status')
  if (status && !(COMMISSION_STATUSES as readonly string[]).includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  const urlId = sp.get('urlId')
  const cursor = sp.get('cursor')
  const where = { userId, ...(status ? { status } : {}), ...(urlId ? { urlId } : {}) }

  const [rows, totals] = await Promise.all([
    prisma.commission.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, conversionId: true, saleValueCents: true, amountCents: true, clawbackCents: true, currency: true, status: true, ruleId: true, scopeKey: true, holdUntil: true, createdAt: true, approvedAt: true, paidAt: true, payoutRef: true, url: { select: { shortCode: true } } },
    }),
    prisma.commission.groupBy({ by: ['status'], where: { userId }, _sum: { amountCents: true, clawbackCents: true }, _count: { _all: true } }),
  ])
  const hasMore = rows.length > PAGE_SIZE
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows
  return NextResponse.json({
    commissions: page.map(({ url, ...r }) => ({ ...r, shortCode: url.shortCode })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
    totals: Object.fromEntries(totals.map((t) => [t.status, { count: t._count._all, amountCents: t._sum.amountCents ?? 0, clawbackCents: t._sum.clawbackCents ?? 0 }])),
  })
}

const actionSchema = z.object({
  action: z.enum(['approve', 'pay', 'reverse']),
  ids: z.array(z.string().min(1).max(40)).min(1).max(500).optional(),
  /** approve only: every pending commission whose refund window has passed. */
  allDue: z.boolean().optional(),
  /** allDue only: approve high-risk commissions too (default false: they are held for review). */
  includeHighRisk: z.boolean().optional(),
  payoutRef: z.string().trim().max(120).optional(),
})

/** POST /api/commissions { action, ids | allDue, payoutRef? } — move commissions through pending → approved → paid. */
export async function POST(request: NextRequest) {
  const limit = await rateLimit(request, { name: 'commissions-action', limit: 30, windowMs: 60_000 })
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })
  const resolved = await resolveActor(request, LINK_WRITE_SCOPES)
  if (!resolved.actor) return NextResponse.json({ error: resolved.error === 'Authentication required' ? 'Unauthorized' : resolved.error }, { status: resolved.status })
  const parsed = actionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  const { action, ids, allDue, payoutRef, includeHighRisk } = parsed.data
  if (allDue && action !== 'approve') return NextResponse.json({ error: 'allDue only applies to approve' }, { status: 400 })
  if (!allDue && !ids) return NextResponse.json({ error: 'Provide ids or allDue' }, { status: 400 })
  const userId = resolved.actor.userId
  const idem = await beginRouteIdempotency(request, userId, parsed.data)
  if (idem.invalid) return NextResponse.json({ error: idem.invalid }, { status: 400 })
  if (idem.replay) return idem.replay as NextResponse
  const now = new Date()
  let changed
  let heldForReview = 0
  try {
    changed = await prisma.$transaction(async (tx) => {
      let targets = ids!
      if (allDue) {
        const due = (await tx.commission.findMany({ where: { userId, status: 'pending', holdUntil: { lte: now } }, select: { id: true }, take: 1000 })).map((r) => r.id)
        if (includeHighRisk) targets = due
        else {
          // Bulk approval never waves through high-risk commissions: they stay pending for a human to review.
          const risky = new Set((await assessCommissionRisk(tx, userId, { statuses: ['pending'], limit: 1000 })).filter((r) => r.level === 'high').map((r) => r.commissionId))
          targets = due.filter((id) => !risky.has(id))
          heldForReview = due.length - targets.length
        }
      }
      return transitionCommissions(tx, userId, action, targets, { payoutRef, now })
    })
  } catch (error) {
    await releaseRouteIdempotency(idem)
    throw error
  }
  await storeRouteIdempotency(request, idem, 200, { changed, heldForReview })
  return NextResponse.json({ changed, heldForReview }, { headers: rateLimitHeaders(limit) })
}
