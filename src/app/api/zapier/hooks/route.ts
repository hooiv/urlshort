import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { WEBHOOK_SCOPES, resolveActor } from '@/lib/request-actor'
import { eventForTrigger } from '@/lib/zapier-hooks'
import { POST as createWebhook } from '../../webhooks/route'

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

  const { target_url, event: _ignored, ...filters } = parsed.data
  void _ignored
  const forwarded = new NextRequest(new URL('/api/webhooks', request.url), {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify({ url: target_url, events: [event], ...filters }),
  })
  const response = await createWebhook(forwarded)
  const body = await response.json().catch(() => null)
  if (response.status !== 201 || !body?.id) return NextResponse.json(body ?? { error: 'Could not subscribe' }, { status: response.status === 201 ? 500 : response.status })
  return NextResponse.json({ id: body.id, event: parsed.data.event }, { status: 201 })
}
