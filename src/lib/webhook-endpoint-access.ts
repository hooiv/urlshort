import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { ADMIN_ROLES } from './workspaces'
import type { ParsedLinkFilter } from './webhook-filters'
import { resolveOwnedLinkIds } from './webhook-link-resolution'

/**
 * Who may see and change a webhook endpoint.
 *
 *  - Personal endpoint (workspaceId null): only its user.
 *  - Workspace endpoint (userId null): the workspace's owners and admins. It
 *    receives events for every link in the workspace, including restricted
 *    folders, so it is an admin-only capability by design.
 */
export async function manageableEndpointWhere(userId: string): Promise<Prisma.WebhookEndpointWhereInput> {
  const adminOf = await prisma.membership.findMany({ where: { userId, role: { in: ADMIN_ROLES } }, select: { workspaceId: true } })
  const workspaceIds = adminOf.map((m) => m.workspaceId)
  return {
    OR: [
      { userId, workspaceId: null },
      ...(workspaceIds.length ? [{ workspaceId: { in: workspaceIds } }] : []),
    ],
  }
}

export async function findManageableEndpoint(userId: string, id: string) {
  return prisma.webhookEndpoint.findFirst({ where: { AND: [{ id }, await manageableEndpointWhere(userId)] } })
}

export async function isWorkspaceAdmin(userId: string, workspaceId: string): Promise<boolean> {
  const membership = await prisma.membership.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { role: true } })
  return Boolean(membership && ADMIN_ROLES.includes(membership.role))
}

type ResolvedFilter = { linkScope: string; tagFilter: string[]; urlIdFilter: string[]; folderIdFilter: string[] }

/**
 * Turns a parsed filter into stored ids, checking every referenced link or
 * folder belongs to the endpoint's owner. Unknown and foreign ids get the same
 * error so the endpoint can't be used to probe other tenants.
 */
export async function resolveEndpointFilter(
  owner: { userId: string; workspaceId: string | null },
  filter: Extract<ParsedLinkFilter, { ok: true }>,
): Promise<{ ok: true; value: ResolvedFilter } | { ok: false; error: string }> {
  const value: ResolvedFilter = { linkScope: filter.linkScope, tagFilter: filter.tagFilter, urlIdFilter: [], folderIdFilter: [] }
  if (filter.linkScope === 'links') {
    if (!owner.workspaceId) {
      const resolved = await resolveOwnedLinkIds(owner.userId, filter.shortCodes)
      if (!resolved.ok) return resolved
      value.urlIdFilter = resolved.ids
    } else {
      const rows = await prisma.url.findMany({
        where: { shortCode: { in: filter.shortCodes }, workspaceId: owner.workspaceId, deletedAt: null },
        select: { id: true, shortCode: true },
      })
      const found = new Set(rows.map((r) => r.shortCode))
      const missing = filter.shortCodes.filter((c) => !found.has(c))
      if (missing.length) return { ok: false, error: `Unknown short code${missing.length > 1 ? 's' : ''} in this workspace: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ', …' : ''}` }
      value.urlIdFilter = rows.map((r) => r.id)
    }
  }
  if (filter.linkScope === 'folders') {
    if (!owner.workspaceId) return { ok: false, error: 'Folder filters are only available on workspace webhooks' }
    const count = await prisma.folder.count({ where: { id: { in: filter.folderIds }, workspaceId: owner.workspaceId } })
    if (count !== filter.folderIds.length) return { ok: false, error: 'Unknown folder in this workspace' }
    value.folderIdFilter = filter.folderIds
  }
  return { ok: true, value }
}
