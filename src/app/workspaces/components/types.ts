export interface Workspace {
  id: string
  name: string
  slug: string
  role: string
}

export interface Member {
  id: string
  membershipId: string
  email: string
  name: string | null
  role: string
}

export interface Invite {
  id: string
  email: string
  role: string
  expiresAt: string
  createdAt: string
}

export interface PendingInviteToken {
  email: string
  token: string
}

export const ROLES = ['viewer', 'analyst', 'editor', 'admin'] as const

export type InviteRole = (typeof ROLES)[number]

export const ROLE_PERMISSIONS: Record<string, string> = {
  owner: 'Full workspace ownership, billing, domain management, and member administration.',
  admin: 'Invite and manage team members, configure custom domains, edit all links and rules.',
  editor: 'Create, modify, and delete short links, routing rules, experiments, and QR codes.',
  analyst: 'View real-time analytics, statistical A/B test results, and export CSV reports.',
  viewer: 'Read-only access to campaign analytics and link metadata.',
}
