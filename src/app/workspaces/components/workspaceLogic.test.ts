import { describe, expect, it } from 'vitest'
import {
  buildInviteLink,
  canInviteAdmin,
  getInitials,
  isAdminRole,
  memberCountLabel,
  normalizeInviteEmail,
  normalizeWorkspaceName,
  resolveSelectedWorkspace,
  shouldShowLeave,
  validateInvite,
  validateInviteEmail,
  validateInviteRole,
  validateWorkspaceName,
} from './workspaceLogic'

describe('isAdminRole / shouldShowLeave / canInviteAdmin', () => {
  it('treats owner and admin as admins', () => {
    expect(isAdminRole('owner')).toBe(true)
    expect(isAdminRole('admin')).toBe(true)
    expect(isAdminRole('editor')).toBe(false)
    expect(isAdminRole(null)).toBe(false)
  })

  it('hides Leave for owners only', () => {
    expect(shouldShowLeave('owner')).toBe(false)
    expect(shouldShowLeave('admin')).toBe(true)
    expect(shouldShowLeave(undefined)).toBe(false)
  })

  it('restricts admin invites to owners', () => {
    expect(canInviteAdmin('owner')).toBe(true)
    expect(canInviteAdmin('admin')).toBe(false)
  })
})

describe('getInitials', () => {
  it('uses word initials for display names', () => {
    expect(getInitials('Jane Doe', 'jane@x.test')).toBe('JD')
    expect(getInitials('Jo', 'jo@x.test')).toBe('JO')
  })

  it('never renders @ for bare emails', () => {
    expect(getInitials(null, 'a@b.com')).toBe('A')
    expect(getInitials(null, 'teammate@company.com')).toBe('TE')
    expect(getInitials('  ', 'x.y@z.test')).toBe('XY')
  })
})

describe('buildInviteLink', () => {
  it('encodes the token and trims trailing slashes', () => {
    expect(buildInviteLink('https://app.test/', 'a b')).toBe('https://app.test/account?invite=a%20b')
    expect(buildInviteLink('https://app.test', 'tok')).toBe('https://app.test/account?invite=tok')
  })
})

describe('workspace name validation', () => {
  it('trims and caps at 80 chars like the API', () => {
    expect(validateWorkspaceName('   ')).toMatch(/name/)
    expect(validateWorkspaceName('x'.repeat(81))).toMatch(/80/)
    expect(validateWorkspaceName('  Acme  ')).toBeNull()
    expect(normalizeWorkspaceName('  Acme  ')).toBe('Acme')
  })
})

describe('invite validation', () => {
  it('normalizes email case and whitespace', () => {
    expect(normalizeInviteEmail('  Team@Company.COM ')).toBe('team@company.com')
  })

  it('rejects blank and malformed emails', () => {
    expect(validateInviteEmail('')).toMatch(/email/i)
    expect(validateInviteEmail('not-an-email')).toMatch(/valid email/)
    expect(validateInviteEmail('a@b.co')).toBeNull()
  })

  it('enforces the role whitelist and the owner-only admin rule', () => {
    expect(validateInviteRole('owner', 'owner')).toMatch(/valid invite role/)
    expect(validateInviteRole('admin', 'admin')).toMatch(/Only the owner/)
    expect(validateInviteRole('admin', 'owner')).toBeNull()
    expect(validateInviteRole('editor', 'admin')).toBeNull()
  })

  it('combines email and role checks', () => {
    expect(validateInvite('bad', 'editor', 'admin')).toMatch(/valid email/)
    expect(validateInvite('a@b.co', 'admin', 'admin')).toMatch(/Only the owner/)
    expect(validateInvite('a@b.co', 'editor', 'admin')).toBeNull()
  })
})

describe('memberCountLabel', () => {
  it('pluralizes correctly', () => {
    expect(memberCountLabel(1)).toBe('1 Member')
    expect(memberCountLabel(3)).toBe('3 Members')
  })
})

describe('resolveSelectedWorkspace', () => {
  const ws = [
    { id: 'w1', name: 'A' },
    { id: 'w2', name: 'B' },
  ]

  it('keeps the current workspace when still present', () => {
    expect(resolveSelectedWorkspace({ id: 'w2', name: 'stale' }, ws)).toMatchObject({ id: 'w2', name: 'B' })
  })

  it('falls back to the first workspace, or null when empty', () => {
    expect(resolveSelectedWorkspace({ id: 'gone', name: 'x' }, ws)).toMatchObject({ id: 'w1' })
    expect(resolveSelectedWorkspace(null, ws)).toMatchObject({ id: 'w1' })
    expect(resolveSelectedWorkspace(null, [])).toBeNull()
  })
})
