import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { WEBHOOK_SCOPES, resolveActor } from '@/lib/request-actor'
import { eventForTrigger } from '@/lib/zapier-hooks'
import { POST as createWebhook } from '../../webhooks/route'
import { beginRouteIdempotency, releaseRouteIdempotency, storeRouteIdempotency } from '@/lib/idempotency-route'

const subscribeSchema = z.object({
  target_url: z.string().trim().min(1).max(2048),
  event: z.string().trim().min(1).max(64),
  workspaceId: z.string().min(1).max(64).optional(),
  tags: z.unknown().optional(),
  shortCodes: z.unknown().optional(),
  folderIds: z.unknown().optional(),
  linkScope: z.unknown().optional(),
})

/**
 * REST-hook subscribe. Delegates to the webhook-create handler so SSRF checks,
 * ownership rules, filters and rate limits are identical to /api/webhooks.
 * The response is the minimal `{ id }` Zapier stores to unsubscribe later.
 */
export async function POST(request: NextRequest) {
  const resolved = await resolveActor(request, WEBHOOK_SCOPES)
  if (!resolved.actor) return NextResponse.json({ error: resolved.status === 401 ? 'Unauthorized' : resolved.error }, { status: resolved.status })

  const parsed = subscribeSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'target_url and event are required' }, { status: 400 })
  const event = eventForTrigger(parsed.data.event)
  if (!event) return NextResponse.json({ error: 'event must be one of new_link, new_click, new_sale' }, { status: 400 })

  // Zapier retries subscribe calls on timeouts; an Idempotency-Key makes that safe.
  const idem = await beginRouteIdempotency(request, resolved.actor.userId, { target_url: parsed.data.target_url, event: parsed.data.event, workspaceId: parsed.data.workspaceId ?? null, tags: parsed.data.tags ?? null, shortCodes: parsed.data.shortCodes ?? null, folderIds: parsed.data.folderIds ?? null, linkScope: parsed.data.linkScope ?? null })
  if (idem.invalid) return NextResponse.json({ error: idem.invalid }, { status: 400 })
  if (idem.replay) return idem.replay as NextResponse

  const { target_url, event: _ignored, ...filters } = parsed.data
  void _ignored
  const forwarded = new NextRequest(new URL('/api/webhooks', request.url), {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify({ url: target_url, events: [event], ...filters }),
  })
  const response = await createWebhook(forwarded)
  const body = await response.json().catch(() => null)
  if (response.status !== 201 || !body?.id) {
    await releaseRouteIdempotency(idem)
    return NextResponse.json(body ?? { error: 'Could not subscribe' }, { status: response.status === 201 ? 500 : response.status })
  }
  const result = { id: body.id, event: parsed.data.event }
  await storeRouteIdempotency(request, idem, 201, result)
  return NextResponse.json(result, { status: 201 })
}
