import { describe, expect, it } from 'vitest'
import { reassignSchema, validateReassign } from './link-reassign'

describe('validateReassign', () => {
  it('rejects same source and target', () => {
    expect(validateReassign({ fromUserId: 'a', toUserId: 'a', dryRun: true })).toMatch(/differ/)
  })
  it('requires confirm unless dry run', () => {
    expect(validateReassign({ fromUserId: 'a', toUserId: 'b' })).toMatch(/confirm/)
    expect(validateReassign({ fromUserId: 'a', toUserId: 'b', dryRun: true })).toBeNull()
    expect(validateReassign({ fromUserId: 'a', toUserId: 'b', confirm: true })).toBeNull()
  })
  it('rejects unknown fields', () => {
    expect(reassignSchema.safeParse({ fromUserId: 'a', toUserId: 'b', extra: 1 }).success).toBe(false)
  })
})
