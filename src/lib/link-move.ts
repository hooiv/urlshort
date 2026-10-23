import type { WorkspaceRole } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { EDIT_ROLES } from '@/lib/workspaces'

/**
 * Move a link into another workspace (or out to the owner's personal space).
 * Folder and deep-link app belong to a workspace, so they are cleared; the
 * short code, history, clicks and settings stay untouched.
 */
export type MoveInput = { ok: true; workspaceId: string | null } | { ok: false; error: string }

export function validateMove(input: { workspaceId?: unknown; confirm?: unknown }, currentWorkspaceId: string | null): MoveInput {
  const { workspaceId } = input
  if (workspaceId !== null && (typeof workspaceId !== 'string' || workspaceId.trim() === '' || workspaceId.length > 64)) {
    return { ok: false, error: 'workspaceId must be a workspace id or null' }
  }
  if ((workspaceId ?? null) === currentWorkspaceId) return { ok: false, error: 'Link is already in that workspace' }
  if (input.confirm !== true) return { ok: false, error: 'Moving clears the link folder and deep-link app. Resend with confirm: true.' }
  return { ok: true, workspaceId: workspaceId as string | null }
}

export class MoveDeniedError extends Error {
  constructor(message: string) {
    super(message)
  }
}

export function canMoveBetween(sourceRole: WorkspaceRole | null | 'creator', targetRole: WorkspaceRole | null, toPersonal: boolean): string | null {
  if (!toPersonal && !(targetRole && EDIT_ROLES.includes(targetRole))) return 'You need an editor role in the target workspace'
  if (sourceRole === 'creator') return null
  if (!sourceRole || !EDIT_ROLES.includes(sourceRole)) return 'You need an editor role in the current workspace'
  return null
}

export async function moveLink(
  url: { id: string; userId: string | null; workspaceId: string | null },
  actorUserId: string,
  target: string | null,
) {
  const [source, dest] = await Promise.all([
    url.workspaceId ? prisma.membership.findUnique({ where: { workspaceId_userId: { workspaceId: url.workspaceId, userId: actorUserId } } }) : null,
    target ? prisma.membership.findUnique({ where: { workspaceId_userId: { workspaceId: target, userId: actorUserId } } }) : null,
  ])
  const sourceRole = url.userId === actorUserId ? 'creator' : (source?.role ?? null)
  const denied = canMoveBetween(sourceRole, dest?.role ?? null, target === null)
  if (denied) throw new MoveDeniedError(denied)
  if (target === null && url.userId !== actorUserId) throw new MoveDeniedError('Only the link creator can move it to a personal space')
  return prisma.url.update({
    where: { id: url.id },
    data: { workspaceId: target, folderId: null, deepLinkAppId: null },
    select: { id: true, shortCode: true, workspaceId: true },
  })
}
