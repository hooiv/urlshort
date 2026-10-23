import { describe, expect, it } from 'vitest'
import { mergeFolderTags, normalizeDefaultTags, pickUtmTemplateId } from './folder-defaults'

describe('folder defaults', () => {
  it('normalizes and dedupes tags', () => {
    expect(normalizeDefaultTags([' Promo ', 'promo', 'q4-sale'])).toEqual(['promo', 'q4-sale'])
  })
  it('rejects invalid and too many tags', () => {
    expect(() => normalizeDefaultTags(['bad!'])).toThrow(/Invalid/)
    expect(() => normalizeDefaultTags(Array.from({ length: 11 }, (_, i) => `t${i}`))).toThrow(/at most/)
  })
  it('keeps explicit tags first and caps the total', () => {
    expect(mergeFolderTags(['a'], ['b', 'a'])).toEqual(['a', 'b'])
    expect(mergeFolderTags(['a'], null)).toEqual(['a'])
    expect(mergeFolderTags(['a', 'b'], ['c'], 2)).toEqual(['a', 'b'])
  })
  it('explicit template wins over the folder default', () => {
    expect(pickUtmTemplateId('x', 'y')).toBe('x')
    expect(pickUtmTemplateId(undefined, 'y')).toBe('y')
    expect(pickUtmTemplateId('', null)).toBeNull()
  })
})
