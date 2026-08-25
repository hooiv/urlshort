import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { slugifyWorkspace } from '@/lib/workspaces'
import { recordAudit } from '@/lib/audit'

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request)
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const memberships = await prisma.membership.findMany({ where: { userId: user.id }, include: { workspace: true }, orderBy: { workspace: { createdAt: 'asc' } } })
  return NextResponse.json(memberships.map((m) => ({ id: m.workspace.id, name: m.workspace.name, slug: m.workspace.slug, role: m.role })))
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request)
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  try {
    const body = (await request.json()) as Record<string, unknown>
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : ''
    if (!name) return NextResponse.json({ error: 'Workspace name is required' }, { status: 400 })
    const workspace = await prisma.workspace.create({ data: { name, slug: slugifyWorkspace(name), members: { create: { userId: user.id, role: 'owner' } } } })
    await recordAudit(request, { action: 'workspace.create', resourceType: 'workspace', resourceId: workspace.id, actorUserId: user.id, after: { name: workspace.name, slug: workspace.slug } })
    return NextResponse.json({ workspace, role: 'owner' }, { status: 201 })
  } catch { return NextResponse.json({ error: 'Could not create workspace' }, { status: 400 }) }
}
