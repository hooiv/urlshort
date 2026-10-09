import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { getManageableUrl } from '@/lib/authorization'
import { recordAudit } from '@/lib/audit'
import { canAdministerFolders, folderWriteError } from '@/lib/folders'

const Body = z.object({ folderId: z.string().min(1).max(64).nullable() })

/**
 * PATCH /api/links/:code/folder { folderId | null }
 *
 * Needs edit rights on the link and on the destination folder. Taking a link
 * out of a restricted folder into a place more people can see is an
 * owner/admin decision, so editors can't widen exposure by moving links.
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  const { shortCode } = await context.params
  const user = await getCurrentUser(request)
  if (!user) return NextResponse.json({ error: 'Sign in to organise links into folders' }, { status: 401 })
  const access = await getManageableUrl(request, shortCode)
  if (!access.url) return NextResponse.json({ error: access.error }, { status: access.status })
  const link = access.url
  if (!link.workspaceId) return NextResponse.json({ error: 'Only workspace links can be filed in folders' }, { status: 400 })

  const parsed = Body.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'folderId must be a folder id or null' }, { status: 400 })
  const target = parsed.data.folderId
  if (target === link.folderId) return NextResponse.json({ shortCode, folderId: target })

  const membership = await prisma.membership.findUnique({ where: { workspaceId_userId: { workspaceId: link.workspaceId, userId: user.id } }, select: { role: true } })
  if (!membership) return NextResponse.json({ error: 'Workspace membership is required' }, { status: 403 })

  if (target) {
    const error = await folderWriteError(user.id, link.workspaceId, membership.role, target)
    if (error) return NextResponse.json({ error }, { status: error === 'Folder not found' ? 404 : 403 })
  }
  if (link.folderId && !canAdministerFolders(membership.role)) {
    const [source, destination] = await Promise.all([
      prisma.folder.findUnique({ where: { id: link.folderId }, select: { restricted: true } }),
      target ? prisma.folder.findUnique({ where: { id: target }, select: { restricted: true } }) : null,
    ])
    if (source?.restricted && !destination?.restricted) return NextResponse.json({ error: 'Only workspace owners and admins can move links out of a restricted folder' }, { status: 403 })
  }

  // Conditional on the folder we checked against, so a concurrent move can't be overwritten blindly.
  const { count } = await prisma.url.updateMany({ where: { id: link.id, folderId: link.folderId }, data: { folderId: target } })
  if (count === 0) return NextResponse.json({ error: 'The link was moved by someone else. Reload and try again.' }, { status: 409 })
  await recordAudit(request, { action: 'link.folder.move', urlId: link.id, resourceType: 'url', resourceId: link.id, before: { folderId: link.folderId }, after: { folderId: target } })
  return NextResponse.json({ shortCode, folderId: target })
}
