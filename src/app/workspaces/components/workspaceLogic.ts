const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const ALLOWED_INVITE_ROLES = ['viewer', 'analyst', 'editor', 'admin'] as const

export function isAdminRole(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'admin'
}

export function shouldShowLeave(role: string | null | undefined): boolean {
  return !!role && role !== 'owner'
}

export function canInviteAdmin(requesterRole: string | null | undefined): boolean {
  return requesterRole === 'owner'
}

/**
 * Two-letter avatar text. Names use word initials ("Jane Doe" → "JD");
 * bare emails fall back to the local part so we never render "A@".
 */
export function getInitials(name: string | null | undefined, email: string): string {
  const trimmedName = (name ?? '').trim()
  if (trimmedName) {
    const words = trimmedName.split(/\s+/).filter(Boolean)
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
    return trimmedName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || '??'
  }
  const local = email.split('@')[0] ?? email
  return local.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || '??'
}

/** Pure builder — the caller supplies the origin (window.location.origin in the browser). */
export function buildInviteLink(origin: string, token: string): string {
  return `${origin.replace(/\/$/, '')}/account?invite=${encodeURIComponent(token)}`
}

export function normalizeWorkspaceName(name: string): string {
  return name.trim().slice(0, 80)
}

export function validateWorkspaceName(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return 'Give the workspace a name'
  if (trimmed.length > 80) return 'Workspace name must be 80 characters or fewer'
  return null
}

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function validateInviteEmail(email: string): string | null {
  const normalized = normalizeInviteEmail(email)
  if (!normalized) return 'Enter a teammate email address'
  if (normalized.length > 320) return 'Email address is too long'
  if (!EMAIL_RE.test(normalized)) return 'Enter a valid email address'
  return null
}

/** Mirrors the invites API: role whitelist + only owners may invite admins. */
export function validateInviteRole(role: string, requesterRole: string | null | undefined): string | null {
  if (!(ALLOWED_INVITE_ROLES as readonly string[]).includes(role)) return 'Choose a valid invite role'
  if (role === 'admin' && requesterRole !== 'owner') return 'Only the owner can invite admins'
  return null
}

export function validateInvite(
  email: string,
  role: string,
  requesterRole: string | null | undefined
): string | null {
  return validateInviteEmail(email) ?? validateInviteRole(role, requesterRole)
}

export function memberCountLabel(count: number): string {
  return `${count} Member${count === 1 ? '' : 's'}`
}

export function resolveSelectedWorkspace<T extends { id: string }>(
  current: T | null,
  workspaces: T[]
): T | null {
  if (current) {
    const stillThere = workspaces.find((workspace) => workspace.id === current.id)
    if (stillThere) return stillThere
  }
  return workspaces[0] ?? null
}
