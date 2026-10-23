import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { LINK_READ_SCOPES, resolveActor } from '@/lib/request-actor'
import { assessCommissionRisk } from '@/lib/commission-risk'

/** GET /api/commissions/risk?minLevel=low|medium|high — fraud-risk signals for unpaid commissions, riskiest first. */
export async function GET(request: NextRequest) {
  const resolved = await resolveActor(request, LINK_READ_SCOPES)
  if (!resolved.actor) return NextResponse.json({ error: resolved.error === 'Authentication required' ? 'Unauthorized' : resolved.error }, { status: resolved.status })
  const minLevel = request.nextUrl.searchParams.get('minLevel') ?? 'medium'
  if (!['low', 'medium', 'high'].includes(minLevel)) return NextResponse.json({ error: 'Invalid minLevel' }, { status: 400 })
  const rank = { low: 0, medium: 1, high: 2 } as const
  const results = (await assessCommissionRisk(prisma, resolved.actor.userId))
    .filter((r) => rank[r.level] >= rank[minLevel as keyof typeof rank])
    .sort((a, b) => b.score - a.score)
  return NextResponse.json({ risks: results }, { headers: { 'Cache-Control': 'no-store' } })
}
