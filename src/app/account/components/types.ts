export type User = { id: string; email: string; name: string | null; emailVerifiedAt?: string | null }

export type Url = {
  id: string
  originalUrl: string
  shortCode: string
  title: string | null
  tags?: string[]
  workspaceId?: string | null
  folderId?: string | null
  clicks: number
  createdAt: string
  isActive: boolean
  pinnedAt?: string | null
  riskStatus: string
  _count?: { rules: number }
}

export type AuditEvent = {
  id: string
  action: string
  actorType: string
  resourceType: string | null
  createdAt: string
  metadataJson: string | null
  urlId: string | null
}

export type ApiKeyRow = {
  id: string
  name: string
  prefix: string
  lastUsedAt: string | null
  revokedAt: string | null
  allowedIps?: string[]
  createdAt: string
}

export type AuthMode = 'login' | 'register'

export type InviteState = 'pending' | 'accepted' | 'error'
