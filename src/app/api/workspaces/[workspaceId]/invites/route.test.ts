import { describe, expect, it } from 'vitest'
import { inviteRoleSchema } from './route'

describe('inviteRoleSchema', () => {
  it('accepts non-owner workspace roles', () => {
    for (const role of ['admin', 'editor', 'analyst', 'viewer']) {
      expect(inviteRoleSchema.safeParse(role).success).toBe(true)
    }
  })

  it('rejects owner escalation and unknown roles', () => {
    expect(inviteRoleSchema.safeParse('owner').success).toBe(false)
    expect(inviteRoleSchema.safeParse('superadmin').success).toBe(false)
    expect(inviteRoleSchema.safeParse('').success).toBe(false)
  })
})
