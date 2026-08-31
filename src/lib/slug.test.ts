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
})
