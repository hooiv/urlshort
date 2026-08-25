import { createHash, randomBytes } from 'node:crypto'
import type { NextRequest } from 'next/server'
import type { WorkspaceRole } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

export const EDIT_ROLES: WorkspaceRole[] = ['owner', 'admin', 'editor']
export const ANALYTICS_ROLES: WorkspaceRole[] = ['owner', 'admin', 'editor', 'analyst']
export const ADMIN_ROLES: WorkspaceRole[] = ['owner', 'admin']

export function slugifyWorkspace(name: string): string {
  const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'workspace'
  return `${base}-${randomBytes(3).toString('hex')}`
}

export function createInviteToken(): string { return randomBytes(32).toString('base64url') }
export function hashInviteToken(token: string): string { return createHash('sha256').update(token).digest('hex') }

export async function getWorkspaceMembership(request: NextRequest, workspaceId: string) {
  const user = await getCurrentUser(request)
  if (!user) return null
  return prisma.membership.findUnique({ where: { workspaceId_userId: { workspaceId, userId: user.id } }, include: { workspace: true } })
}

export async function requireWorkspaceRole(request: NextRequest, workspaceId: string, allowed: WorkspaceRole[]) {
  const membership = await getWorkspaceMembership(request, workspaceId)
  if (!membership) return { membership: null, error: 'Workspace access required', status: 401 as const }
  if (!allowed.includes(membership.role)) return { membership: null, error: 'Insufficient workspace permissions', status: 403 as const }
  return { membership, error: null, status: 200 as const }
}

export async function getDefaultWorkspace(userId: string) {
  return prisma.workspace.findFirst({ where: { members: { some: { userId, role: 'owner' } } }, orderBy: { createdAt: 'asc' } })
}
