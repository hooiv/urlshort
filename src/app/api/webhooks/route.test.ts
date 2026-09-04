import { describe, expect, it } from 'vitest'
import { normalizeEvents, webhookCreateSchema } from './route'

describe('normalizeEvents', () => {
  it('accepts allowlisted events and dedupes', () => {
    expect(normalizeEvents(['link.clicked', 'link.clicked', 'link.created'])).toEqual([
      'link.clicked',
      'link.created',
    ])
  })

  it('maps legacy click alias', () => {
    expect(normalizeEvents('click')).toEqual(['link.clicked'])
  })

  it('rejects unknown events instead of coercing', () => {
    expect(() => normalizeEvents(['not-a-real-event'])).toThrow('Unsupported webhook event')
    expect(() => normalizeEvents(['link.clicked', 'bogus'])).toThrow('Unsupported webhook event')
  })

  it('requires at least one event', () => {
    expect(() => normalizeEvents([])).toThrow()
  })
})

describe('webhookCreateSchema', () => {
  it('accepts a valid body', () => {
    expect(
      webhookCreateSchema.safeParse({ url: 'https://example.com/hook', events: ['link.clicked'] }).success,
    ).toBe(true)
  })

  it('rejects missing url and oversized events', () => {
    expect(webhookCreateSchema.safeParse({ events: ['link.clicked'] }).success).toBe(false)
    expect(
      webhookCreateSchema.safeParse({ url: 'https://example.com/hook', events: Array(11).fill('link.clicked') })
        .success,
    ).toBe(false)
  })
})
