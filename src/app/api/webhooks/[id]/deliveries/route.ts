import { NextRequest, NextResponse } from 'next/server'
import { WEBHOOK_SCOPES, resolveActor } from '@/lib/request-actor'
import { findManageableEndpoint } from '@/lib/webhook-endpoint-access'
import { decodeDeliveryCursor, deliveryStats, listDeliveries } from '@/lib/webhook-delivery-log'

const STATUSES = new Set(['pending', 'success', 'failed'])

/**
 * GET → delivery log for one endpoint, newest first.
 * Query: status=pending|success|failed, cursor (from nextCursor), limit (≤100).
 * The first page also carries 24h stats (success rate, p50/p95 latency).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resolved = await resolveActor(request, WEBHOOK_SCOPES)
  if (!resolved.actor) return NextResponse.json({ error: resolved.status === 401 ? 'Unauthorized' : resolved.error }, { status: resolved.status })
  const { id } = await params
  const endpoint = await findManageableEndpoint(resolved.actor.userId, id)
  if (!endpoint) return NextResponse.json({ error: 'Not found or forbidden' }, { status: 404 })

  const search = request.nextUrl.searchParams
  const status = search.get('status')
  if (status && !STATUSES.has(status)) return NextResponse.json({ error: 'status must be pending, success or failed' }, { status: 400 })
  const rawCursor = search.get('cursor')
  const cursor = decodeDeliveryCursor(rawCursor)
  if (rawCursor && !cursor) return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 })
  const limit = Number(search.get('limit') ?? 50)
  if (!Number.isInteger(limit) || limit < 1) return NextResponse.json({ error: 'limit must be a positive integer' }, { status: 400 })

  const [page, stats] = await Promise.all([
    listDeliveries(endpoint.id, { status: (status as 'pending' | 'success' | 'failed' | null) ?? undefined, cursor, limit }),
    cursor ? Promise.resolve(undefined) : deliveryStats(endpoint.id, new Date(Date.now() - 24 * 60 * 60_000)),
  ])
  return NextResponse.json({ ...page, ...(stats ? { stats } : {}) }, { headers: { 'Cache-Control': 'no-store' } })
}
