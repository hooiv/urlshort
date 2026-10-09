import { NextRequest, NextResponse } from 'next/server'
import { WEBHOOK_SCOPES, resolveActor } from '@/lib/request-actor'
import { findManageableEndpoint } from '@/lib/webhook-endpoint-access'
import { getDelivery } from '@/lib/webhook-delivery-log'

/** GET → one delivery with the exact payload sent and the (truncated) response body. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; deliveryId: string }> }) {
  const resolved = await resolveActor(request, WEBHOOK_SCOPES)
  if (!resolved.actor) return NextResponse.json({ error: resolved.status === 401 ? 'Unauthorized' : resolved.error }, { status: resolved.status })
  const { id, deliveryId } = await params
  const endpoint = await findManageableEndpoint(resolved.actor.userId, id)
  if (!endpoint) return NextResponse.json({ error: 'Not found or forbidden' }, { status: 404 })
  const delivery = await getDelivery(endpoint.id, deliveryId)
  if (!delivery) return NextResponse.json({ error: 'Delivery not found' }, { status: 404 })
  return NextResponse.json(delivery, { headers: { 'Cache-Control': 'no-store' } })
}
