import { NextRequest, NextResponse } from 'next/server'
import { WEBHOOK_SCOPES, resolveActor } from '@/lib/request-actor'
import { DELETE as deleteWebhook } from '../../../webhooks/[id]/route'

/** REST-hook unsubscribe: same ownership rules as DELETE /api/webhooks/:id. */
export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const resolved = await resolveActor(request, WEBHOOK_SCOPES)
  if (!resolved.actor) return NextResponse.json({ error: resolved.status === 401 ? 'Unauthorized' : resolved.error }, { status: resolved.status })
  return deleteWebhook(request, ctx)
}
