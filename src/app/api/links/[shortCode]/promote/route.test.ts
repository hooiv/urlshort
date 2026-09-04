import { describe, expect, it } from 'vitest'
import { promoteSchema } from './route'

describe('promoteSchema', () => {
  it('requires a ruleId', () => {
    expect(promoteSchema.safeParse({}).success).toBe(false)
    expect(promoteSchema.safeParse({ ruleId: '  ' }).success).toBe(false)
    expect(promoteSchema.safeParse({ ruleId: 'rule_1' }).success).toBe(true)
  })
})
