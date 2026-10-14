import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { LINK_READ_SCOPES, resolveActor } from '@/lib/request-actor'
import { buildPayoutStatement } from '@/lib/payout-statement'

/** GET /api/commissions/statement?month=YYYY-MM — per-currency payout statement (default: current UTC month). */
export async function GET(request: NextRequest) {
  const resolved = await resolveActor(request, LINK_READ_SCOPES)
  if (!resolved.actor) return NextResponse.json({ error: resolved.error === 'Authentication required' ? 'Unauthorized' : resolved.error }, { status: resolved.status })
  const month = request.nextUrl.searchParams.get('month') ?? new Date().toISOString().slice(0, 7)
  const statement = await buildPayoutStatement(prisma, resolved.actor.userId, month)
  if (!statement) return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 })
  return NextResponse.json(statement, { headers: { 'Cache-Control': 'no-store' } })
}
