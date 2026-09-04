import { describe, expect, it } from 'vitest'
import { bulkCsvSchema, normalizeBulkTags, resolveBulkShortCode } from './route'

describe('bulkCsvSchema', () => {
  it('rejects empty and oversized payloads', () => {
    expect(bulkCsvSchema.safeParse({ csv: '' }).success).toBe(false)
    expect(bulkCsvSchema.safeParse({}).success).toBe(false)
    expect(bulkCsvSchema.safeParse({ csv: 'originalUrl\nhttps://example.com' }).success).toBe(true)
  })
})

describe('normalizeBulkTags', () => {
  it('lowercases, dedupes, and drops invalid tags', () => {
    expect(normalizeBulkTags('News; news ; A!;ok-tag')).toEqual(['news', 'ok-tag'])
    expect(normalizeBulkTags('')).toEqual([])
  })

  it('caps at 10 tags', () => {
    const many = Array.from({ length: 20 }, (_, i) => `t${i}`).join(';')
    expect(normalizeBulkTags(many)).toHaveLength(10)
  })
})

describe('resolveBulkShortCode', () => {
  it('accepts valid aliases and generates otherwise', () => {
    expect(resolveBulkShortCode('my-code_1')).toBe('my-code_1')
    expect(resolveBulkShortCode('ab')).not.toBe('ab')
    expect(resolveBulkShortCode('api')).not.toBe('api')
    expect(resolveBulkShortCode(undefined)).toMatch(/.+/)
  })
})
