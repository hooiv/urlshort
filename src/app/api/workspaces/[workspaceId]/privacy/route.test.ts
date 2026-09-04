import { describe, expect, it } from 'vitest'
import { privacyPolicySchema } from './route'

const base = {
  region: 'eu',
  retentionDays: 90,
  hashIp: true,
  hashVisitor: true,
  storeUserAgent: false,
  storeReferrer: false,
  aggregateOnly: false,
}

describe('privacyPolicySchema', () => {
  it('accepts a complete policy', () => {
    expect(privacyPolicySchema.safeParse(base).success).toBe(true)
  })

  it('rejects out-of-range retention and missing flags', () => {
    expect(privacyPolicySchema.safeParse({ ...base, retentionDays: 0 }).success).toBe(false)
    expect(privacyPolicySchema.safeParse({ ...base, retentionDays: 3651 }).success).toBe(false)
    expect(privacyPolicySchema.safeParse({ ...base, hashIp: 'yes' }).success).toBe(false)
  })
})
