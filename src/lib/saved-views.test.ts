import { describe, expect, it } from 'vitest'
import { savedViewInputSchema } from './saved-views'

describe('saved view schema', () => {
  it('accepts a normal preset and trims the name', () => {
    const r = savedViewInputSchema.parse({ name: '  Q4 promo ', filters: { tags: ['promo'], status: 'active', sort: 'clicks' } })
    expect(r.name).toBe('Q4 promo')
  })
  it('rejects unknown filter keys, bad enums, empty names and too many tags', () => {
    expect(savedViewInputSchema.safeParse({ name: 'x', filters: { evil: 1 } }).success).toBe(false)
    expect(savedViewInputSchema.safeParse({ name: 'x', filters: { status: 'deleted' } }).success).toBe(false)
    expect(savedViewInputSchema.safeParse({ name: ' ', filters: {} }).success).toBe(false)
    expect(savedViewInputSchema.safeParse({ name: 'x', filters: { tags: Array(11).fill('a') } }).success).toBe(false)
  })
})
