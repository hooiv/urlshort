import type { NextRequest } from 'next/server'
import type { WorkspaceRole } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { hasValidManagementToken } from '@/lib/management'
import { authenticateApiKey } from '@/lib/api-keys'
import { EDIT_ROLES } from '@/lib/workspaces'
export { EDIT_ROLES }

export const READ_ROLES: WorkspaceRole[] = ['owner', 'admin', 'editor', 'analyst', 'viewer']

async function getRoleForUrl(request: NextRequest, url: { userId: string | null; workspaceId?: string | null }) {
  const user = await getCurrentUser(request)
  if (!user) return null
  if (url.userId === user.id) return 'owner' as WorkspaceRole
  if (!url.workspaceId) return null
  const membership = await prisma.membership.findUnique({ where: { workspaceId_userId: { workspaceId: url.workspaceId, userId: user.id } } })
  return membership?.role ?? null
}

async function getRoleForUserId(userId: string, url: { userId: string | null; workspaceId?: string | null }) {
  if (url.userId === userId) return 'owner' as WorkspaceRole
  if (!url.workspaceId) return null
  const membership = await prisma.membership.findUnique({ where: { workspaceId_userId: { workspaceId: url.workspaceId, userId } } })
  return membership?.role ?? null
}

/**
 * Three auth paths:
 * 1. Per-link management token (header or Bearer).
 * 2. Session cookie → workspace role.
 * 3. API key (`x-api-key` / Bearer `qlk_…`) → owner's workspace role.
 */
export async function canManageUrl(request: NextRequest, url: { managementTokenHash: string | null; userId: string | null; workspaceId?: string | null }, allowedRoles: WorkspaceRole[] = EDIT_ROLES): Promise<boolean> {
  if (hasValidManagementToken(request, url.managementTokenHash)) return true
  const role = await getRoleForUrl(request, url)
  if (role && allowedRoles.includes(role)) return true
  const apiKeyAuth = await authenticateApiKey(request)
  if (apiKeyAuth) {
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


