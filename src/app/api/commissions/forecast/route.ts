import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { LINK_READ_SCOPES, resolveActor } from '@/lib/request-actor'
import { buildCommissionForecast } from '@/lib/commission-forecast'

/** GET /api/commissions/forecast — what you owe in commissions and when refund holds release, per currency. */
export async function GET(request: NextRequest) {
  const resolved = await resolveActor(request, LINK_READ_SCOPES)
  if (!resolved.actor) return NextResponse.json({ error: resolved.error === 'Authentication required' ? 'Unauthorized' : resolved.error }, { status: resolved.status })
  const forecasts = await buildCommissionForecast(prisma, resolved.actor.userId)
  return NextResponse.json({ forecasts }, { headers: { 'Cache-Control': 'no-store' } })
}
