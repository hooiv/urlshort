import { describe, expect, it } from 'vitest'
import { buildLinkSearchWhere, normalizeSearch, MAX_SEARCH_LENGTH } from './link-search'

describe('link search', () => {
  it('returns null for empty input', () => {
    expect(buildLinkSearchWhere('   ')).toBeNull()
    expect(buildLinkSearchWhere(undefined)).toBeNull()
  })
  it('collapses whitespace and caps length', () => {
    expect(normalizeSearch('  a   b ')).toBe('a b')
    expect(normalizeSearch('x'.repeat(500))).toHaveLength(MAX_SEARCH_LENGTH)
  })
  it('searches code, title, url, notes and lowercase tag', () => {
    const where = buildLinkSearchWhere('Promo') as { OR: Record<string, unknown>[] }
    expect(where.OR).toHaveLength(5)
    expect(where.OR).toContainEqual({ notes: { contains: 'Promo', mode: 'insensitive' } })
    expect(where.OR).toContainEqual({ tags: { has: 'promo' } })
  })
})
