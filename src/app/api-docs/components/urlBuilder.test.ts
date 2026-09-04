import { describe, expect, it } from 'vitest'
import { API_CATALOG, groupCatalog, methodHasBody } from './apiCatalog'
import { buildResolvedPath } from './urlBuilder'

const shortenList = API_CATALOG.find((e) => e.id === 'shorten-list')!
const linkDetail = API_CATALOG.find((e) => e.id === 'link-detail')!
const analyticsGet = API_CATALOG.find((e) => e.id === 'analytics-get')!

describe('groupCatalog', () => {
  it('preserves declaration order and groups every endpoint', () => {
    const groups = groupCatalog(API_CATALOG)
    expect(groups.map(([name]) => name)).toEqual([
      'Core Links',
      'Smart Routing & A/B Tests',
      'Analytics & Attribution',
      'Diagnostics & Webhooks',
    ])
    expect(groups.flatMap(([, eps]) => eps)).toHaveLength(API_CATALOG.length)
  })
})

describe('methodHasBody', () => {
  it('matches the methods the page renders a JSON editor for', () => {
    expect(methodHasBody('POST')).toBe(true)
    expect(methodHasBody('PATCH')).toBe(true)
    expect(methodHasBody('GET')).toBe(false)
    expect(methodHasBody('DELETE')).toBe(false)
  })
})

describe('buildResolvedPath', () => {
  it('resolves path placeholders with URI encoding', () => {
    expect(buildResolvedPath(linkDetail, { shortCode: 'abc 123' }, {})).toBe('/api/links/abc%20123')
  })

  it('falls back to the param default when the input is blank', () => {
    expect(buildResolvedPath(linkDetail, { shortCode: '   ' }, {})).toBe('/api/links/demo')
  })

  it('appends only non-empty trimmed query params', () => {
    expect(
      buildResolvedPath(shortenList, {}, { search: '  launch ', tag: '', take: '20' }),
    ).toBe('/api/shorten?search=launch&take=20')
  })

  it('omits the query string entirely when every value is empty', () => {
    expect(buildResolvedPathedgecases()).toBe('/api/shorten')
  })

  function buildResolvedPathedgecases(): string {
    return buildResolvedPath(shortenList, {}, { search: '', tag: '   ' })
  }

  it('combines path params and query params like the analytics endpoint', () => {
    expect(
      buildResolvedPath(analyticsGet, { shortCode: 'demo' }, { range: '7d', country: '', device: 'mobile' }),
    ).toBe('/api/analytics/demo?range=7d&device=mobile')
  })
})
