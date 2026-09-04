import { describe, expect, it } from 'vitest'
import {
  buildShortenQuery,
  extractInvitedEmail,
  formatAuditAction,
  isValidDestinationUrl,
  normalizeEmail,
  parseTagsInput,
  safeDestinationHref,
  summarizeLinks,
  validateApiKeyName,
  validateAuthInput,
  validateLinkEdit,
} from './account-utils'

describe('formatAuditAction', () => {
  it('maps known actions to friendly labels', () => {
    expect(formatAuditAction('auth.register')).toBe('Account created')
    expect(formatAuditAction('auth.login')).toBe('Signed in')
    expect(formatAuditAction('auth.logout')).toBe('Signed out')
    expect(formatAuditAction('routing_rule.create')).toBe('Routing rule created')
    expect(formatAuditAction('destination_release.create')).toBe('Destination release published')
  })

  it('prettifies unknown actions', () => {
    expect(formatAuditAction('workspace.member_invited')).toBe('Workspace Member Invited')
    expect(formatAuditAction('link.deleted')).toBe('Link Deleted')
  })
})

describe('parseTagsInput', () => {
  it('trims, drops empties, and de-duplicates while preserving order', () => {
    expect(parseTagsInput('summer, paid-ads, summer ,,  q3 ')).toEqual(['summer', 'paid-ads', 'q3'])
  })

  it('caps tags at the maximum', () => {
    const input = Array.from({ length: 15 }, (_, i) => `tag${i}`).join(', ')
    expect(parseTagsInput(input)).toHaveLength(10)
    expect(parseTagsInput(input, 3)).toEqual(['tag0', 'tag1', 'tag2'])
  })

  it('returns an empty array for blank input', () => {
    expect(parseTagsInput(' , ,')).toEqual([])
    expect(parseTagsInput('')).toEqual([])
  })
})

describe('buildShortenQuery', () => {
  it('builds a paged query with trimmed search and tag', () => {
    const params = new URLSearchParams(buildShortenQuery({ take: 50, search: '  promo ', tag: 'ads' }))
    expect(params.get('take')).toBe('50')
    expect(params.get('search')).toBe('promo')
    expect(params.get('tag')).toBe('ads')
  })

  it('omits blank search, tag, and cursor', () => {
    const params = new URLSearchParams(buildShortenQuery({ search: '   ' }))
    expect(params.get('take')).toBe('50')
    expect(params.has('search')).toBe(false)
    expect(params.has('tag')).toBe(false)
    expect(params.has('cursor')).toBe(false)
  })

  it('includes a cursor for pagination', () => {
    const params = new URLSearchParams(buildShortenQuery({ cursor: 'abc123' }))
    expect(params.get('cursor')).toBe('abc123')
  })
})

describe('destination urls', () => {
  it('accepts http(s) urls with surrounding whitespace', () => {
    expect(isValidDestinationUrl('https://example.com/a?b=c')).toBe(true)
    expect(isValidDestinationUrl('  http://example.com  ')).toBe(true)
  })

  it('rejects non-http(s), empty, and malformed values', () => {
    expect(isValidDestinationUrl('javascript:alert(1)')).toBe(false)
    expect(isValidDestinationUrl('data:text/html,hi')).toBe(false)
    expect(isValidDestinationUrl('ftp://example.com')).toBe(false)
    expect(isValidDestinationUrl('not a url')).toBe(false)
    expect(isValidDestinationUrl('')).toBe(false)
  })

  it('safeDestinationHref never returns an executable scheme', () => {
    expect(safeDestinationHref('https://example.com')).toBe('https://example.com')
    expect(safeDestinationHref('javascript:alert(1)')).toBe('#')
  })
})

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Ada@Example.COM ')).toBe('ada@example.com')
  })
})

describe('validateAuthInput', () => {
  it('rejects invalid emails even with surrounding whitespace', () => {
    expect(validateAuthInput({ mode: 'login', email: '  not-an-email ', password: 'x'.repeat(12) })).toBe(
      'Enter a valid email address',
    )
  })

  it('rejects short passwords without hitting the network', () => {
    expect(validateAuthInput({ mode: 'login', email: 'a@b.co', password: 'short' })).toBe(
      'Password must be at least 12 characters',
    )
  })

  it('rejects overlong display names on register', () => {
    expect(
      validateAuthInput({ mode: 'register', email: 'a@b.co', password: 'x'.repeat(12), name: 'n'.repeat(81) }),
    ).toBe('Name must be 80 characters or fewer')
  })

  it('accepts valid login and register input', () => {
    expect(
      validateAuthInput({ mode: 'login', email: '  A@b.co ', password: 'x'.repeat(12) }),
    ).toBeNull()
    expect(
      validateAuthInput({ mode: 'register', email: 'a@b.co', password: 'x'.repeat(12), name: 'Ada' }),
    ).toBeNull()
  })
})

describe('validateApiKeyName', () => {
  it('rejects blank and overlong names', () => {
    expect(validateApiKeyName('   ')).toBe('Give the key a name')
    expect(validateApiKeyName('k'.repeat(81))).toBe('Key name must be 80 characters or fewer')
  })

  it('accepts a trimmed name', () => {
    expect(validateApiKeyName('  zapier-integration ')).toBeNull()
  })
})

describe('validateLinkEdit', () => {
  it('rejects overlong titles, missing destinations, and bad schemes', () => {
    expect(validateLinkEdit({ title: 't'.repeat(201), destination: 'https://x.co', tagsInput: '' })).toBe(
      'Title must be 200 characters or fewer',
    )
    expect(validateLinkEdit({ title: '', destination: '   ', tagsInput: '' })).toBe(
      'Destination URL is required',
    )
    expect(validateLinkEdit({ title: '', destination: 'javascript:alert(1)', tagsInput: '' })).toBe(
      'Destination must be a valid http(s) URL',
    )
  })

  it('accepts a valid edit', () => {
    expect(
      validateLinkEdit({ title: 'Promo', destination: 'https://x.co', tagsInput: 'a, b' }),
    ).toBeNull()
  })
})

describe('extractInvitedEmail', () => {
  it('reads ?email= from a search string', () => {
    expect(extractInvitedEmail('?email=invited%40example.com')).toBe('invited@example.com')
  })

  it('returns null when absent or unparseable', () => {
    expect(extractInvitedEmail('?invite=abc')).toBeNull()
    expect(extractInvitedEmail('?email=   ')).toBeNull()
  })
})

describe('summarizeLinks', () => {
  it('totals clicks, counts active links, and rounds the average', () => {
    expect(
      summarizeLinks([
        { clicks: 10, isActive: true },
        { clicks: 5, isActive: false },
        { clicks: 4, isActive: true },
      ]),
    ).toEqual({ total: 19, active: 2, average: 6 })
  })

  it('handles empty lists and non-finite click counts', () => {
    expect(summarizeLinks([])).toEqual({ total: 0, active: 0, average: 0 })
    expect(summarizeLinks([{ clicks: NaN, isActive: true }])).toEqual({ total: 0, active: 1, average: 0 })
  })
})
