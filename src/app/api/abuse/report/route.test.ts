import { describe, expect, it } from 'vitest'
import { abuseReportSchema } from './route'

describe('abuseReportSchema', () => {
  it('accepts a minimal valid report', () => {
    const parsed = abuseReportSchema.safeParse({ shortCode: 'abc123', reason: 'spam' })
    expect(parsed.success).toBe(true)
  })

  it('rejects bad reasons and empty/oversized short codes', () => {
    expect(abuseReportSchema.safeParse({ shortCode: 'abc', reason: 'nope' }).success).toBe(false)
    expect(abuseReportSchema.safeParse({ shortCode: '', reason: 'spam' }).success).toBe(false)
    expect(abuseReportSchema.safeParse({ shortCode: 'x'.repeat(65), reason: 'spam' }).success).toBe(false)
  })
})
