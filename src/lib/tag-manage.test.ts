import { describe, expect, it } from 'vitest'
import { removeTag, replaceTag, tagDeleteSchema, tagRenameSchema } from './tag-manage'

describe('replaceTag', () => {
  it('keeps position', () => expect(replaceTag(['a', 'b', 'c'], 'b', 'x')).toEqual(['a', 'x', 'c']))
  it('merges into an existing tag without duplicates', () => expect(replaceTag(['a', 'b', 'c'], 'c', 'a')).toEqual(['a', 'b']))
  it('is a no-op when the tag is absent', () => expect(replaceTag(['a'], 'z', 'y')).toEqual(['a']))
})

describe('tagRenameSchema', () => {
  it('trims and rejects empty or oversized names', () => {
    expect(tagRenameSchema.parse({ from: ' a ', to: 'b' }).from).toBe('a')
    expect(tagRenameSchema.safeParse({ from: '', to: 'b' }).success).toBe(false)
    expect(tagRenameSchema.safeParse({ from: 'a', to: 'x'.repeat(41) }).success).toBe(false)
  })
})

describe('removeTag / tagDeleteSchema', () => {
  it('removes only the named tag', () => expect(removeTag(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']))
  it('is a no-op when absent', () => expect(removeTag(['a'], 'z')).toEqual(['a']))
  it('validates input', () => {
    expect(tagDeleteSchema.parse({ tag: ' a ' }).tag).toBe('a')
    expect(tagDeleteSchema.safeParse({ tag: '' }).success).toBe(false)
  })
})

import { aggregateTags } from './tag-manage'
describe('aggregateTags', () => {
  const rows = [{ tags: ['a', 'b', 'a'] }, { tags: ['b'] }, { tags: ['Beta', 'c'] }, { tags: [] }]
  it('counts each tag once per link, most used first', () => {
    expect(aggregateTags(rows)).toEqual([{ tag: 'b', links: 2 }, { tag: 'a', links: 1 }, { tag: 'Beta', links: 1 }, { tag: 'c', links: 1 }])
  })
  it('filters case-insensitively and limits', () => {
    expect(aggregateTags(rows, 'BE')).toEqual([{ tag: 'Beta', links: 1 }])
    expect(aggregateTags(rows, undefined, 2)).toHaveLength(2)
  })
})
