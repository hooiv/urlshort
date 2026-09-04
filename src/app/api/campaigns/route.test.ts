import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { areVariantWeightsValid, hasSingleControl, toCampaignCreateError } from './route'

describe('areVariantWeightsValid', () => {
  it('requires weights to total 100', () => {
    expect(areVariantWeightsValid([{ weight: 50 }, { weight: 50 }])).toBe(true)
    expect(areVariantWeightsValid([{ weight: 70 }, { weight: 20 }])).toBe(false)
  })
})

describe('hasSingleControl', () => {
  it('allows zero or one control', () => {
    expect(hasSingleControl([{ isControl: true }, {}])).toBe(true)
    expect(hasSingleControl([{}, {}])).toBe(true)
  })

  it('rejects two controls', () => {
    expect(hasSingleControl([{ isControl: true }, { isControl: true }])).toBe(false)
  })
})

describe('toCampaignCreateError', () => {
  it('maps Zod errors without leaking internals', () => {
    expect(toCampaignCreateError(new z.ZodError([]))).toEqual({ error: 'Invalid campaign', status: 400 })
  })

  it('maps slug conflicts to 409', () => {
    const err = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
    expect(toCampaignCreateError(err)).toEqual({ error: 'Campaign slug already exists', status: 409 })
  })

  it('maps unknown errors to a generic message', () => {
    expect(toCampaignCreateError(new Error('column "xyz" does not exist'))).toEqual({
      error: 'Unable to create campaign',
      status: 400,
    })
  })
})
