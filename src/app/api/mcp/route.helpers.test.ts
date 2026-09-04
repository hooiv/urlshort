import { describe, expect, it } from 'vitest'
import { assertToolCampaignId, sanitizeMcpToolError } from './route'

describe('assertToolCampaignId', () => {
  it('accepts a normal id', () => {
    expect(assertToolCampaignId('cmp_123')).toBe('cmp_123')
  })

  it('rejects empty, non-string, or oversized ids', () => {
    expect(() => assertToolCampaignId('')).toThrow('Invalid campaignId')
    expect(() => assertToolCampaignId(undefined)).toThrow('Invalid campaignId')
    expect(() => assertToolCampaignId('x'.repeat(129))).toThrow('Invalid campaignId')
  })
})

describe('sanitizeMcpToolError', () => {
  it('preserves authorization/usage errors as 403', () => {
    expect(sanitizeMcpToolError(new Error('campaign:read scope required'))).toEqual({
      message: 'campaign:read scope required',
      status: 403,
    })
    expect(sanitizeMcpToolError(new Error('Unknown tool'))).toEqual({ message: 'Unknown tool', status: 403 })
  })

  it('maps internal failures to a generic 500', () => {
    expect(sanitizeMcpToolError(new Error('Unique constraint failed on the fields: (`id`)'))).toEqual({
      message: 'Tool failed',
      status: 500,
    })
  })
})
