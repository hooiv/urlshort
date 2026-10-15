import { describe, expect, it } from 'vitest'
import { missingPreviewFields, parseMissingPreviewLimit, MISSING_PREVIEW_DEFAULT } from './missing-previews'

describe('missing-previews', () => {
  it('parses limits strictly', () => {
    expect(parseMissingPreviewLimit(null)).toBe(MISSING_PREVIEW_DEFAULT)
    expect(parseMissingPreviewLimit('200')).toBe(200)
    expect(parseMissingPreviewLimit('201')).toBeNull()
    expect(parseMissingPreviewLimit('0')).toBeNull()
    expect(parseMissingPreviewLimit('1e2')).toBeNull()
  })
  it('lists absent fields, treating blanks as missing', () => {
    expect(missingPreviewFields({ title: 'a', description: 'b', ogImage: 'c' })).toEqual([])
    expect(missingPreviewFields({ title: ' ', description: null, ogImage: 'c' })).toEqual(['title', 'description'])
    expect(missingPreviewFields({ title: null, description: null, ogImage: '' })).toEqual(['title', 'description', 'image'])
  })
})
