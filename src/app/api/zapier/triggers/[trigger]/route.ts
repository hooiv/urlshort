import { NextRequest, NextResponse } from 'next/server'
import { ANALYTICS_READ_SCOPES, LINK_READ_SCOPES, resolveActor } from '@/lib/request-actor'
import { isZapierTrigger, parsePollLimit, pollTrigger } from '@/lib/zapier-hooks'
import { rateLimit } from '@/lib/rate-limit'

/**
 * Polling trigger: newest-first array of plain objects with a stable `id`,
 * which is what Zapier's de-duplication and the editor's sample data expect.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ trigger: string }> }) {
  const { trigger } = await params
  if (!isZapierTrigger(trigger)) return NextResponse.json({ error: 'Unknown trigger' }, { status: 404 })
  const resolved = trigger === 'new_link' ? await resolveActor(request, LINK_READ_SCOPES) : await resolveActor(request, ANALYTICS_READ_SCOPES)
  if (!resolved.actor) return NextResponse.json({ error: resolved.status === 401 ? 'Unauthorized' : resolved.error }, { status: resolved.status })
  const limit = await rateLimit(request, { name: 'zapier-poll', limit: 120, windowMs: 60_000 })
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  const rows = await pollTrigger(trigger, resolved.actor.userId, parsePollLimit(request.nextUrl.searchParams.get('limit')))
  return NextResponse.json(rows)
}
