import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { schema, toCreateCampaignError } from './route'

const validBody = {
  name: 'Launch',
  slug: 'launch-1',
  objective: 'conversion_rate',
  variants: [
    { name: 'A', destinationUrl: 'https://example.com/a', weight: 50 },
    { name: 'B', destinationUrl: 'https://example.com/b', weight: 50 },
  ],
}

describe('campaign create schema', () => {
  it('accepts a valid body', () => {
    expect(schema.safeParse(validBody).success).toBe(true)
  })

  it('rejects a bad slug', () => {
    expect(schema.safeParse({ ...validBody, slug: 'Bad Slug!' }).success).toBe(false)
  })
})

describe('toCreateCampaignError', () => {
  it('maps Zod errors to 400 without leaking internals', () => {
    const zodErr = new z.ZodError([])
    expect(toCreateCampaignError(zodErr).status).toBe(400)
  })

  it('maps database errors to a generic message', () => {
    const dbErr = new Error('Unique constraint failed on the fields: (`slug`)')
    expect(toCreateCampaignError(dbErr)).toEqual({ error: 'Could not create campaign', status: 400 })
  })
})
