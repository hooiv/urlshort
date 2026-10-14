import { describe, expect, it } from 'vitest'
import { forwardQueryParams } from '@/lib/redirect'
import { filterForwardedParams } from '@/lib/query-forwarding'

describe('query forwarding wired into destination building', () => {
  const incoming = new URLSearchParams('utm_source=x&ql_debug=1&token=1&password=p&keep=2')
  it('none leaves the destination untouched', () => {
    expect(forwardQueryParams('https://a.com/p', filterForwardedParams(incoming, { mode: 'none', allow: [] }))).toBe('https://a.com/p')
  })
  it('allowlist forwards only listed names and never credentials', () => {
    const out = forwardQueryParams('https://a.com/p', filterForwardedParams(incoming, { mode: 'allowlist', allow: ['utm_source', 'password'] }))
    expect(out).toBe('https://a.com/p?utm_source=x')
  })
  it('all drops ql_* and credential params but keeps the rest', () => {
    const out = new URL(forwardQueryParams('https://a.com/p', filterForwardedParams(incoming, { mode: 'all', allow: [] })))
    expect([...out.searchParams.keys()].sort()).toEqual(['keep', 'token', 'utm_source'])
  })
})
