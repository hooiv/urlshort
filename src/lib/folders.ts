import type { Prisma, WorkspaceRole } from '@prisma/client'
import { prisma } from './prisma'

/**
 * Link folders.
 *
 * An open folder follows workspace roles. A restricted folder is visible only
 * to workspace owners/admins and members with an explicit grant, and a grant
 * never lifts anyone above their workspace role: the effective role is the
 * lower of the two. Links outside any folder behave exactly as before.
 */

export const ROLE_RANK: Record<WorkspaceRole, number> = { viewer: 0, analyst: 1, editor: 2, admin: 3, owner: 4 }
export const FOLDER_GRANT_ROLES = ['editor', 'analyst', 'viewer'] as const satisfies readonly WorkspaceRole[]
const FOLDER_ADMINS: WorkspaceRole[] = ['owner', 'admin']

export function lowerRole(a: WorkspaceRole, b: WorkspaceRole): WorkspaceRole {
  return ROLE_RANK[a] <= ROLE_RANK[b] ? a : b
}

/** Effective role on a link given the member's workspace role and the link's folder. */
export function effectiveFolderRole(
  workspaceRole: WorkspaceRole | null,
  folder: { restricted: boolean } | null,
  grant: WorkspaceRole | null,
): WorkspaceRole | null {
  if (!workspaceRole) return null
  if (!folder || !folder.restricted) return workspaceRole
  if (FOLDER_ADMINS.includes(workspaceRole)) return workspaceRole
  return grant ? lowerRole(workspaceRole, grant) : null
}

/** Applies a link's folder to a workspace role (one indexed lookup, skipped when the link has no folder). */
export async function roleWithinFolder(userId: string, workspaceRole: WorkspaceRole | null, folderId: string | null | undefined): Promise<WorkspaceRole | null> {
  if (!workspaceRole || !folderId) return workspaceRole
  if (FOLDER_ADMINS.includes(workspaceRole)) return workspaceRole
  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
    select: { restricted: true, access: { where: { userId }, select: { role: true }, take: 1 } },
  })
  return effectiveFolderRole(workspaceRole, folder, folder?.access[0]?.role ?? null)
}

/**
 * Prisma filter for every link `userId` may see: their own links, plus
 * workspace links outside restricted folders they have no grant for.
 */
export function visibleUrlWhere(userId: string): Prisma.UrlWhereInput {
  return {
    OR: [
      { userId },
      { workspace: { members: { some: { userId, role: { in: FOLDER_ADMINS } } } } },
      {
        workspace: { members: { some: { userId } } },
        OR: [{ folderId: null }, { folder: { restricted: false } }, { folder: { access: { some: { userId } } } }],
      },
    ],
  }
}

/** Folders in a workspace the member can see, with link counts. */
export async function listVisibleFolders(workspaceId: string, userId: string, workspaceRole: WorkspaceRole) {
  const where: Prisma.FolderWhereInput = FOLDER_ADMINS.includes(workspaceRole)
    ? { workspaceId }
    : { workspaceId, OR: [{ restricted: false }, { access: { some: { userId } } }] }
  const folders = await prisma.folder.findMany({
    where,
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { urls: { where: { deletedAt: null } } } },
      access: { select: { userId: true, role: true, user: { select: { email: true, name: true } } } },
    },
  })
  return folders.map((folder) => ({
    id: folder.id,
    name: folder.name,
    description: folder.description,
    restricted: folder.restricted,
    linkCount: folder._count.urls,
    role: effectiveFolderRole(workspaceRole, folder, folder.access.find((a) => a.userId === userId)?.role ?? null),
    // Only folder admins see who else has access.
    access: FOLDER_ADMINS.includes(workspaceRole) ? folder.access.map((a) => ({ userId: a.userId, role: a.role, email: a.user.email, name: a.user.name })) : undefined,
  }))
}

export function canAdministerFolders(role: WorkspaceRole | null | undefined): boolean {
  return Boolean(role && FOLDER_ADMINS.includes(role))
}

export function normalizeFolderName(input: string): string {
  const name = input.trim().replace(/\s+/g, ' ')
  if (!name || name.length > 60) throw new Error('Folder name must be 1–60 characters')
  return name
}

const WRITE_ROLES: WorkspaceRole[] = ['owner', 'admin', 'editor']

/**
 * Checks that `userId` (with `workspaceRole`) may put links into `folderId`
 * in `workspaceId`. Returns an error message, or null when allowed.
 */
export async function folderWriteError(userId: string, workspaceId: string, workspaceRole: WorkspaceRole, folderId: string): Promise<string | null> {
  const folder = await prisma.folder.findFirst({
    where: { id: folderId, workspaceId },
    select: { restricted: true, access: { where: { userId }, select: { role: true }, take: 1 } },
  })
  const role = folder ? effectiveFolderRole(workspaceRole, folder, folder.access[0]?.role ?? null) : null
  if (!role) return 'Folder not found'
  if (!WRITE_ROLES.includes(role)) return 'Editor permission on this folder is required'
  return null
}
