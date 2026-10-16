import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generatePublicEventKey } from '@/lib/attribution'
import { getManageableUrl } from '@/lib/authorization'
import { resolveActor, LINK_WRITE_SCOPES } from '@/lib/request-actor'
import { beginRouteIdempotency, releaseRouteIdempotency, storeRouteIdempotency } from '@/lib/idempotency-route'

async function authorize(request: NextRequest, shortCode: string) { const result = await getManageableUrl(request, shortCode); if (!result.url) return { response: NextResponse.json({ error: result.error }, { status: result.status }) }; return { url: result.url } }
function parseGoal(body: unknown) { const input = body as Record<string, unknown>; const name = typeof input.name === 'string' ? input.name.trim().slice(0, 80) : ''; if (!name) throw new Error('Goal name is required'); const requestedKey = typeof input.eventKey === 'string' ? input.eventKey.trim() : ''; const eventKey = (requestedKey || generatePublicEventKey(name)).slice(0, 64); if (!/^[a-z0-9_]+$/.test(eventKey)) throw new Error('Event key may contain lowercase letters, numbers, and underscores only'); return { name, eventKey, enabled: input.enabled === undefined ? true : Boolean(input.enabled) } }
export async function GET(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) { const { shortCode } = await context.params; const auth = await authorize(request, shortCode); if ('response' in auth) return auth.response; return NextResponse.json(await prisma.goal.findMany({ where: { urlId: auth.url.id }, orderBy: { createdAt: 'asc' } })) }
export async function POST(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  const { shortCode } = await context.params
  const auth = await authorize(request, shortCode)
  if ('response' in auth) return auth.response
  let data: ReturnType<typeof parseGoal>
  try { data = parseGoal(await request.json()) } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid goal' }, { status: 400 }) }
  const resolved = await resolveActor(request, LINK_WRITE_SCOPES)
  const idem = await beginRouteIdempotency(request, resolved.actor?.userId ?? null, { shortCode, ...data })
  if (idem.invalid) return NextResponse.json({ error: idem.invalid }, { status: 400 })
  if (idem.replay) return idem.replay as NextResponse
  try {
    const goal = await prisma.goal.create({ data: { urlId: auth.url.id, ...data } })
    await storeRouteIdempotency(request, idem, 201, JSON.parse(JSON.stringify(goal)))
    return NextResponse.json(goal, { status: 201 })
  } catch (error) {
    await releaseRouteIdempotency(idem)
    const message = error instanceof Error ? error.message : 'Could not create goal'
    return NextResponse.json({ error: message }, { status: message.includes('Unique constraint') ? 409 : 400 })
  }
}
