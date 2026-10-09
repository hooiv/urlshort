import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import { recordAudit } from '@/lib/audit'
import { WEBHOOK_SCOPES, resolveActor } from '@/lib/request-actor'
import { findManageableEndpoint } from '@/lib/webhook-endpoint-access'
import { REPLAY_FAILED_MAX, replayFailedDeliveries } from '@/lib/webhook-delivery-log'

const MAX_WINDOW_HOURS = 24 * 7

/**
 * POST { hours?: 1..168 } → queue every failed delivery from the window for
 * the retry worker (newest REPLAY_FAILED_MAX). Typical use: the receiver was
 * down, it's back, resend what it missed. Idempotent per failed delivery.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resolved = await resolveActor(request, WEBHOOK_SCOPES)
  if (!resolved.actor) return NextResponse.json({ error: resolved.status === 401 ? 'Unauthorized' : resolved.error }, { status: resolved.status })
  const limit = await rateLimit(request, { name: 'webhooks-replay-failed', limit: 5, windowMs: 10 * 60_000, identifier: resolved.actor.userId })
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const { id } = await params
  const endpoint = await findManageableEndpoint(resolved.actor.userId, id)
  if (!endpoint) return NextResponse.json({ error: 'Not found or forbidden' }, { status: 404 })
  if (!endpoint.isActive) return NextResponse.json({ error: 'Enable the endpoint before redelivering' }, { status: 409 })

  const body = (await request.json().catch(() => ({}))) as { hours?: unknown }
  const hours = body.hours === undefined ? 24 : Number(body.hours)
  if (!Number.isInteger(hours) || hours < 1 || hours > MAX_WINDOW_HOURS) return NextResponse.json({ error: `hours must be an integer from 1 to ${MAX_WINDOW_HOURS}` }, { status: 400 })

  const result = await replayFailedDeliveries(endpoint, new Date(Date.now() - hours * 60 * 60_000))
  if (result.quotaExceeded) return NextResponse.json({ error: 'Webhook delivery quota exceeded' }, { status: 402 })
  if (result.queued) await recordAudit(request, { action: 'webhook.redeliver_failed', resourceType: 'webhook_endpoint', resourceId: endpoint.id, after: { queued: result.queued, hours } })
  return NextResponse.json({ queued: result.queued, max: REPLAY_FAILED_MAX })
}
