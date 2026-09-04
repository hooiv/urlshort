import { describe, expect, it } from 'vitest'
import { approveSchema } from './route'

describe('approveSchema', () => {
  it('accepts approved with optional comment', () => {
    expect(approveSchema.safeParse({ approved: true, comment: 'looks good' }).success).toBe(true)
    expect(approveSchema.safeParse({ approved: false }).success).toBe(true)
  })

  it('rejects missing approved and oversized comments', () => {
    expect(approveSchema.safeParse({}).success).toBe(false)
    expect(approveSchema.safeParse({ approved: 'yes' }).success).toBe(false)
    expect(approveSchema.safeParse({ approved: true, comment: 'x'.repeat(2001) }).success).toBe(false)
  })
})
