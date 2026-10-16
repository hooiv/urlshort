import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { LINK_READ_SCOPES, resolveActor } from '@/lib/request-actor'
import { slugifyWorkspace } from '@/lib/workspaces'
import { recordAudit } from '@/lib/audit'
import { beginRouteIdempotency, releaseRouteIdempotency, storeRouteIdempotency } from '@/lib/idempotency-route'

export async function GET(request: NextRequest) {
  const resolved = await resolveActor(request, LINK_READ_SCOPES)
  if (!resolved.actor) return NextResponse.json({ error: resolved.error }, { status: resolved.status })
  const user = { id: resolved.actor.userId }
  const memberships = await prisma.membership.findMany({ where: { userId: user.id }, include: { workspace: true }, orderBy: { workspace: { createdAt: 'asc' } } })
  return NextResponse.json(memberships.map((m) => ({ id: m.workspace.id, name: m.workspace.name, slug: m.workspace.slug, role: m.role })))
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request)
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  let idem: Awaited<ReturnType<typeof beginRouteIdempotency>> | null = null
  try {
    const body = (await request.json()) as Record<string, unknown>
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : ''
    if (!name) return NextResponse.json({ error: 'Workspace name is required' }, { status: 400 })
    idem = await beginRouteIdempotency(request, user.id, { name })
    if (idem.invalid) return NextResponse.json({ error: idem.invalid }, { status: 400 })
    if (idem.replay) return idem.replay as NextResponse
    const workspace = await prisma.workspace.create({ data: { name, slug: slugifyWorkspace(name), members: { create: { userId: user.id, role: 'owner' } } } })
    await recordAudit(request, { action: 'workspace.create', resourceType: 'workspace', resourceId: workspace.id, actorUserId: user.id, after: { name: workspace.name, slug: workspace.slug } })
    const payload = { workspace, role: 'owner' }
    await storeRouteIdempotency(request, idem, 201, JSON.parse(JSON.stringify(payload)))
    return NextResponse.json(payload, { status: 201 })
  } catch {
    if (idem) await releaseRouteIdempotency(idem)
    return NextResponse.json({ error: 'Could not create workspace' }, { status: 400 }) }
}
