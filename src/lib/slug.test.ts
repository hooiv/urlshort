import { describe, expect, it } from 'vitest'
import { generateSlugSuggestions } from './slug'

describe('Slug Suggestion Generator', () => {
  it('generates clean kebab slugs from a title', () => {
    const suggestions = generateSlugSuggestions('The Ultimate Guide to React 19', 'https://example.com/react')
    expect(suggestions).toContain('ultimate-guide-react')
    expect(suggestions.some((s) => s.includes('react'))).toBe(true)
  })

  it('generates slugs from destination URL pathnames', () => {
    const suggestions = generateSlugSuggestions('', 'https://github.com/facebook/react')
    expect(suggestions).toContain('react')
    expect(suggestions).toContain('facebook-react')
  })

  it('excludes reserved words', () => {
    const suggestions = generateSlugSuggestions('API Documentation', 'https://example.com/api')
    expect(suggestions.every((s) => s !== 'api' && s !== 'admin' && s !== 'auth')).toBe(true)
  })

  it('never exceeds 32 chars and returns only slug-safe characters', () => {
    const suggestions = generateSlugSuggestions(
      'Extraordinarily Long Marketing Campaign Title Номер 1 !!!',
      'https://example.com/a-very-long-path-segment-that-keeps-going-and-going'
    )
    for (const s of suggestions) {
      expect(s.length).toBeLessThanOrEqual(32)
      expect(s).toMatch(/^[a-z0-9-]+$/)
    }
  })

  it('tolerates empty, null and malformed input', () => {
    expect(() => generateSlugSuggestions(null, undefined)).not.toThrow()
    expect(() => generateSlugSuggestions('   ', 'http://')).not.toThrow()
    expect(generateSlugSuggestions('', '')).toEqual([])
  })

  it('accepts schemeless destinations', () => {
    expect(generateSlugSuggestions('', 'github.com/facebook/react')).toContain('react')
  })

  it('never returns duplicates and only emits url-safe slugs', () => {
    const out = generateSlugSuggestions('Café Müller: Summer Sale!!', 'https://shop.example.com/summer-sale')
    expect(new Set(out).size).toBe(out.length)
    for (const slug of out) expect(slug).toMatch(/^[a-z0-9-]+$/)
  })
})
