import type { NextRequest } from 'next/server'
import type { WorkspaceRole } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { hasValidManagementToken } from '@/lib/management'
import { authenticateApiKey, hasAnyApiScope } from '@/lib/api-keys'
import { ANALYTICS_READ_SCOPES, LINK_WRITE_SCOPES } from '@/lib/request-actor'
import { EDIT_ROLES } from '@/lib/workspaces'
import { roleWithinFolder } from '@/lib/folders'
export { EDIT_ROLES }

export const READ_ROLES: WorkspaceRole[] = ['owner', 'admin', 'editor', 'analyst', 'viewer']

type UrlAccessShape = { userId: string | null; workspaceId?: string | null; folderId?: string | null }

async function getRoleForUrl(request: NextRequest, url: UrlAccessShape) {
  const user = await getCurrentUser(request)
  if (!user) return null
  return getRoleForUserId(user.id, url)
}

/** The creator is owner; otherwise the workspace role, narrowed by a restricted folder. */
export async function getRoleForUserId(userId: string, url: UrlAccessShape): Promise<WorkspaceRole | null> {
  if (url.userId === userId) return 'owner' as WorkspaceRole
  if (!url.workspaceId) return null
  const membership = await prisma.membership.findUnique({ where: { workspaceId_userId: { workspaceId: url.workspaceId, userId } } })
  return roleWithinFolder(userId, membership?.role ?? null, url.folderId)
}

/**
 * Three auth paths:
 * 1. Per-link management token (header or Bearer).
 * 2. Session cookie → workspace role.
 * 3. API key (`x-api-key` / Bearer `qlk_…`) → owner's workspace role.
 */
export async function canManageUrl(request: NextRequest, url: { managementTokenHash: string | null } & UrlAccessShape, allowedRoles: WorkspaceRole[] = EDIT_ROLES): Promise<boolean> {
  if (hasValidManagementToken(request, url.managementTokenHash)) return true
  const role = await getRoleForUrl(request, url)
  if (role && allowedRoles.includes(role)) return true
  const apiKeyAuth = await authenticateApiKey(request)
  if (apiKeyAuth) {
    // Keys act within their scopes: read-only routes accept read/analytics
    // scopes, anything that needs an edit role needs links:write.
    const readOnly = allowedRoles.some((r) => r === 'viewer' || r === 'analyst')
    if (!hasAnyApiScope(apiKeyAuth, readOnly ? ANALYTICS_READ_SCOPES : LINK_WRITE_SCOPES)) return false
    const apiKeyRole = await getRoleForUserId(apiKeyAuth.userId, url)
    return Boolean(apiKeyRole && allowedRoles.includes(apiKeyRole))
  }
  return false
}

export async function getManageableUrl(request: NextRequest, shortCode: string, allowedRoles: WorkspaceRole[] = EDIT_ROLES) {
  const url = await prisma.url.findUnique({ where: { shortCode } })
  if (!url) return { url: null, error: 'Short link not found', status: 404 as const }
  if (!(await canManageUrl(request, url, allowedRoles))) return { url: null, error: 'Insufficient permissions', status: 403 as const }
  return { url, error: null, status: 200 as const }
}


