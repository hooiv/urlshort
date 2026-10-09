import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getWorkspaceMembership, EDIT_ROLES } from '@/lib/workspaces'
import { recordAudit } from '@/lib/audit'
import { canAdministerFolders, listVisibleFolders, normalizeFolderName } from '@/lib/folders'

export const MAX_FOLDERS_PER_WORKSPACE = 500

const CreateFolder = z.object({
  name: z.string().max(120),
  description: z.string().max(280).optional(),
  restricted: z.boolean().optional(),
})

/** GET → folders this member can see, with link counts and their effective role. */
export async function GET(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await context.params
  const membership = await getWorkspaceMembership(request, workspaceId)
  if (!membership) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  return NextResponse.json({ folders: await listVisibleFolders(workspaceId, membership.userId, membership.role), canAdminister: canAdministerFolders(membership.role) })
}

/** POST → create a folder. Editors can create open folders; restricted ones need owner/admin. */
export async function POST(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await context.params
  const membership = await getWorkspaceMembership(request, workspaceId)
  if (!membership) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  if (!EDIT_ROLES.includes(membership.role)) return NextResponse.json({ error: 'Editor permission is required' }, { status: 403 })
  const parsed = CreateFolder.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid folder' }, { status: 400 })
  if (parsed.data.restricted && !canAdministerFolders(membership.role)) return NextResponse.json({ error: 'Only workspace owners and admins can create restricted folders' }, { status: 403 })
  let name: string
  try {
    name = normalizeFolderName(parsed.data.name)
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
  if ((await prisma.folder.count({ where: { workspaceId } })) >= MAX_FOLDERS_PER_WORKSPACE) return NextResponse.json({ error: `A workspace can have at most ${MAX_FOLDERS_PER_WORKSPACE} folders` }, { status: 409 })
  try {
    const folder = await prisma.folder.create({
      data: { workspaceId, name, description: parsed.data.description?.trim() || null, restricted: parsed.data.restricted ?? false, createdById: membership.userId },
    })
    await recordAudit(request, { action: 'folder.create', urlId: null, resourceType: 'folder', resourceId: folder.id, after: { workspaceId, name, restricted: folder.restricted } })
    return NextResponse.json(folder, { status: 201 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return NextResponse.json({ error: 'A folder with that name already exists' }, { status: 409 })
    throw error
  }
}
