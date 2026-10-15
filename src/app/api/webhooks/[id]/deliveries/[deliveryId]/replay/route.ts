import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { recordAudit } from '@/lib/audit'
import { WEBHOOK_SCOPES, resolveActor } from '@/lib/request-actor'
import { findManageableEndpoint } from '@/lib/webhook-endpoint-access'
import { enqueueWebhook, processWebhookDelivery } from '@/lib/webhooks'

/**
 * POST → resend one delivery now. Sends the stored body byte for byte under a
 * new delivery id (receivers that dedupe on the original payload id can still
 * do so); the attempt runs inline so the caller sees the outcome immediately.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; deliveryId: string }> }) {
  const resolved = await resolveActor(request, WEBHOOK_SCOPES)
  if (!resolved.actor) return NextResponse.json({ error: resolved.status === 401 ? 'Unauthorized' : resolved.error }, { status: resolved.status })
  const limit = await rateLimit(request, { name: 'webhooks-replay', limit: 30, windowMs: 60_000, identifier: resolved.actor.userId })
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })

  const { id, deliveryId } = await params
  const endpoint = await findManageableEndpoint(resolved.actor.userId, id)
  if (!endpoint) return NextResponse.json({ error: 'Not found or forbidden' }, { status: 404 })
  if (!endpoint.isActive) return NextResponse.json({ error: 'Enable the endpoint before redelivering' }, { status: 409 })
  const original = await prisma.webhookDelivery.findFirst({ where: { id: deliveryId, endpointId: endpoint.id }, select: { id: true, event: true, payload: true } })
  if (!original) return NextResponse.json({ error: 'Delivery not found' }, { status: 404 })

  let delivery
  try {
    delivery = await enqueueWebhook(endpoint.id, original.event, original.payload, { replayOfId: original.id })
  } catch (error) {
    if (error instanceof Error && /quota/i.test(error.message)) return NextResponse.json({ error: 'Webhook delivery quota exceeded' }, { status: 402 })
    throw error
  }
  const result = await processWebhookDelivery(delivery.id)
  await recordAudit(request, { action: 'webhook.redeliver', resourceType: 'webhook_endpoint', resourceId: endpoint.id, after: { deliveryId: delivery.id, replayOf: original.id } })
  return NextResponse.json({ deliveryId: delivery.id, replayOfId: original.id, status: result.status ?? 'pending', statusCode: result.responseCode, latencyMs: result.latencyMs }, { status: 201 })
}
