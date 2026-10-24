import { describe, expect, it } from 'vitest'
import { parsePixelLimit, platformsOf } from './pixel-links'

describe('pixel-links', () => {
  it('parses limit strictly', () => {
    expect(parsePixelLimit(null)).toBe(50)
    expect(parsePixelLimit('200')).toBe(200)
    expect(parsePixelLimit('201')).toBeNull()
    expect(parsePixelLimit('0')).toBeNull()
    expect(parsePixelLimit('1e2')).toBeNull()
  })
  it('lists platforms with non-empty ids only', () => {
    expect(platformsOf({ metaPixelId: '123', tiktokPixelId: '', uetTagId: 'x' })).toEqual(['Meta', 'Microsoft'])
    expect(platformsOf({})).toEqual([])
  })
})
