import { describe, expect, it } from 'vitest'
import { bulkEditSchema, nextTags } from './bulk-edit'

describe('nextTags', () => {
  it('adds, dedupes and lowercases', () => expect(nextTags(['a'], { addTags: ['A', 'b', 'B'] })).toEqual(['a', 'b']))
  it('removes after adding', () => expect(nextTags(['a', 'b'], { removeTags: ['B'] })).toEqual(['a']))
  it('replaces with setTags', () => expect(nextTags(['a'], { setTags: ['x'] })).toEqual(['x']))
  it('enforces the per-link cap', () => {
    const many = Array.from({ length: 20 }, (_, i) => `t${i}`)
    expect(() => nextTags(many, { addTags: ['extra'] })).toThrow(/at most 20/)
  })
})

describe('bulkEditSchema', () => {
  const links = ['abc']
  it('needs a change', () => expect(bulkEditSchema.safeParse({ links, changes: {} }).success).toBe(false))
  it('rejects setTags with addTags', () => expect(bulkEditSchema.safeParse({ links, changes: { setTags: ['a'], addTags: ['b'] } }).success).toBe(false))
  it('rejects utm with template', () => expect(bulkEditSchema.safeParse({ links, changes: { utm: { source: 'x' }, utmTemplateId: 't' } }).success).toBe(false))
  it('rejects past expiry', () => expect(bulkEditSchema.safeParse({ links, changes: { expiresAt: '2020-01-01T00:00:00Z' } }).success).toBe(false))
  it('accepts maxClicks and null to clear it', () => {
    expect(bulkEditSchema.safeParse({ links, changes: { maxClicks: 500 } }).success).toBe(true)
    expect(bulkEditSchema.safeParse({ links, changes: { maxClicks: null } }).success).toBe(true)
  })
  it('accepts an http(s) expiredUrl or null, rejects other schemes', () => {
    expect(bulkEditSchema.safeParse({ links, changes: { expiredUrl: 'https://example.com/over' } }).success).toBe(true)
    expect(bulkEditSchema.safeParse({ links, changes: { expiredUrl: null } }).success).toBe(true)
    expect(bulkEditSchema.safeParse({ links, changes: { expiredUrl: 'javascript:alert(1)' } }).success).toBe(false)
    expect(bulkEditSchema.safeParse({ links, changes: { expiredUrl: 'ftp://example.com/x' } }).success).toBe(false)
  })
  it('accepts an http(s) notStartedUrl or null, rejects other schemes', () => {
    expect(bulkEditSchema.safeParse({ links, changes: { notStartedUrl: 'https://example.com/soon' } }).success).toBe(true)
    expect(bulkEditSchema.safeParse({ links, changes: { notStartedUrl: null } }).success).toBe(true)
    expect(bulkEditSchema.safeParse({ links, changes: { notStartedUrl: 'javascript:alert(1)' } }).success).toBe(false)
  })
  it('rejects non-positive or fractional maxClicks', () => {
    expect(bulkEditSchema.safeParse({ links, changes: { maxClicks: 0 } }).success).toBe(false)
    expect(bulkEditSchema.safeParse({ links, changes: { maxClicks: 1.5 } }).success).toBe(false)
  })
  it('accepts extendExpiryDays', () => expect(bulkEditSchema.safeParse({ links, changes: { extendExpiryDays: 30 } }).success).toBe(true))
  it('rejects extendExpiryDays out of range or combined with expiresAt', () => {
    expect(bulkEditSchema.safeParse({ links, changes: { extendExpiryDays: 0 } }).success).toBe(false)
    expect(bulkEditSchema.safeParse({ links, changes: { extendExpiryDays: 3651 } }).success).toBe(false)
    expect(bulkEditSchema.safeParse({ links, changes: { extendExpiryDays: 5, expiresAt: null } }).success).toBe(false)
  })
  it('accepts cloaked boolean only', () => {
    expect(bulkEditSchema.safeParse({ links, changes: { cloaked: true } }).success).toBe(true)
    expect(bulkEditSchema.safeParse({ links, changes: { cloaked: 'yes' } }).success).toBe(false)
  })
  it('accepts null expiry and folder', () => expect(bulkEditSchema.safeParse({ links, changes: { expiresAt: null, folderId: null } }).success).toBe(true))
  it('accepts startsAt and null', () => { expect(bulkEditSchema.safeParse({ links, changes: { startsAt: '2030-01-01T00:00:00Z' } }).success).toBe(true); expect(bulkEditSchema.safeParse({ links, changes: { startsAt: null } }).success).toBe(true) })
  it('rejects startsAt after expiresAt', () => expect(bulkEditSchema.safeParse({ links, changes: { startsAt: '2031-01-01T00:00:00Z', expiresAt: '2030-06-01T00:00:00Z' } }).success).toBe(false))
  it('rejects unknown keys and >500 links', () => {
    expect(bulkEditSchema.safeParse({ links, changes: { nope: 1 } }).success).toBe(false)
    expect(bulkEditSchema.safeParse({ links: Array.from({ length: 501 }, (_, i) => `c${i}`), changes: { archived: true } }).success).toBe(false)
  })
})
