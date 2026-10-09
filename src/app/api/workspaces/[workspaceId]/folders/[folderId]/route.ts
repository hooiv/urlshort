import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getWorkspaceMembership, EDIT_ROLES } from '@/lib/workspaces'
import { recordAudit } from '@/lib/audit'
import { FOLDER_GRANT_ROLES, canAdministerFolders, effectiveFolderRole, normalizeFolderName } from '@/lib/folders'

type Ctx = { params: Promise<{ workspaceId: string; folderId: string }> }

const UpdateFolder = z.object({
  name: z.string().max(120).optional(),
  description: z.string().max(280).nullable().optional(),
  restricted: z.boolean().optional(),
  /** Replaces the whole grant list. Owner/admin only. */
  access: z.array(z.object({ userId: z.string().min(1).max(64), role: z.enum(FOLDER_GRANT_ROLES) })).max(500).optional(),
})

async function load(request: NextRequest, workspaceId: string, folderId: string) {
  const membership = await getWorkspaceMembership(request, workspaceId)
  if (!membership) return null
  const folder = await prisma.folder.findFirst({ where: { id: folderId, workspaceId }, include: { access: true } })
  if (!folder) return null
  const role = effectiveFolderRole(membership.role, folder, folder.access.find((a) => a.userId === membership.userId)?.role ?? null)
  // Folders you cannot see do not exist, as far as you can tell.
  if (!role) return null
  return { membership, folder, role }
}

/** PATCH → rename/describe (folder editors); restrict or change access (owner/admin). */
export async function PATCH(request: NextRequest, context: Ctx) {
  const { workspaceId, folderId } = await context.params
  const ctx = await load(request, workspaceId, folderId)
  if (!ctx) return NextResponse.json({ error: 'Folder not found' }, { status: 404 })
  const parsed = UpdateFolder.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid update' }, { status: 400 })
  const { name, description, restricted, access } = parsed.data
  const admin = canAdministerFolders(ctx.membership.role)
  if ((restricted !== undefined || access !== undefined) && !admin) return NextResponse.json({ error: 'Only workspace owners and admins can change folder access' }, { status: 403 })
  if (!EDIT_ROLES.includes(ctx.role)) return NextResponse.json({ error: 'Editor permission is required' }, { status: 403 })

  if (access) {
    const ids = [...new Set(access.map((a) => a.userId))]
    if (ids.length !== access.length) return NextResponse.json({ error: 'Each member can appear only once' }, { status: 400 })
    const members = await prisma.membership.count({ where: { workspaceId, userId: { in: ids } } })
    if (members !== ids.length) return NextResponse.json({ error: 'Folder access can only be granted to workspace members' }, { status: 400 })
  }

  let data: Prisma.FolderUpdateInput = {}
  try {
    if (name !== undefined) data = { ...data, name: normalizeFolderName(name) }
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
  if (description !== undefined) data = { ...data, description: description?.trim() || null }
  if (restricted !== undefined) data = { ...data, restricted }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const folder = await tx.folder.update({ where: { id: folderId }, data })
      if (access) {
        await tx.folderAccess.deleteMany({ where: { folderId } })
        if (access.length) await tx.folderAccess.createMany({ data: access.map((a) => ({ folderId, userId: a.userId, role: a.role })) })
      }
      return folder
    })
    await recordAudit(request, {
      action: 'folder.update',
      urlId: null,
      resourceType: 'folder',
      resourceId: folderId,
      before: { name: ctx.folder.name, restricted: ctx.folder.restricted, access: ctx.folder.access.map((a) => ({ userId: a.userId, role: a.role })) },
      after: { name: updated.name, restricted: updated.restricted, access: access ?? undefined },
    })
    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return NextResponse.json({ error: 'A folder with that name already exists' }, { status: 409 })
    throw error
  }
}

/** DELETE → owner/admin. Links stay in the workspace, outside any folder. */
export async function DELETE(request: NextRequest, context: Ctx) {
  const { workspaceId, folderId } = await context.params
  const ctx = await load(request, workspaceId, folderId)
  if (!ctx) return NextResponse.json({ error: 'Folder not found' }, { status: 404 })
  if (!canAdministerFolders(ctx.membership.role)) return NextResponse.json({ error: 'Only workspace owners and admins can delete folders' }, { status: 403 })
  // Deleting a restricted folder would expose its links to the whole workspace.
  if (ctx.folder.restricted && request.nextUrl.searchParams.get('exposeLinks') !== 'true') {
    const links = await prisma.url.count({ where: { folderId } })
    if (links > 0) return NextResponse.json({ error: `This restricted folder holds ${links} link(s). Deleting it makes them visible to every workspace member. Move them first, or retry with ?exposeLinks=true.`, code: 'would_expose_links', links }, { status: 409 })
  }
  const moved = await prisma.$transaction(async (tx) => {
    const { count } = await tx.url.updateMany({ where: { folderId }, data: { folderId: null } })
    await tx.folder.delete({ where: { id: folderId } })
    return count
  })
  await recordAudit(request, { action: 'folder.delete', urlId: null, resourceType: 'folder', resourceId: folderId, before: { name: ctx.folder.name, restricted: ctx.folder.restricted }, metadata: { linksMoved: moved } })
  return NextResponse.json({ deleted: true, linksMoved: moved })
}
