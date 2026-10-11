import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { LINK_READ_SCOPES, resolveActor } from '@/lib/request-actor'
import { COMMISSION_STATUSES, commissionsToCsv } from '@/lib/commissions'

const MAX_ROWS = 20_000

/** GET /api/commissions/export?status=approved — payout CSV (default: approved, i.e. ready to pay). */
export async function GET(request: NextRequest) {
  const resolved = await resolveActor(request, LINK_READ_SCOPES)
  if (!resolved.actor) return NextResponse.json({ error: resolved.error === 'Authentication required' ? 'Unauthorized' : resolved.error }, { status: resolved.status })
  const status = request.nextUrl.searchParams.get('status') ?? 'approved'
  if (!(COMMISSION_STATUSES as readonly string[]).includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  const rows = await prisma.commission.findMany({
    where: { userId: resolved.actor.userId, status },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: MAX_ROWS,
    select: { id: true, conversionId: true, saleValueCents: true, currency: true, amountCents: true, clawbackCents: true, status: true, ruleId: true, scopeKey: true, createdAt: true, approvedAt: true, paidAt: true, payoutRef: true, url: { select: { shortCode: true } } },
  })
  const csv = commissionsToCsv(rows.map(({ url, ...r }) => ({ ...r, shortCode: url.shortCode })))
  return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="commissions-${status}.csv"`, 'Cache-Control': 'no-store' } })
}
