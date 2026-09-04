import { describe, expect, it } from 'vitest'
import { authHeaderName, buildAuthHeaders, resolveCredential } from './authHeaders'
import { API_CATALOG } from './apiCatalog'

const shortenCreate = API_CATALOG.find((e) => e.id === 'shorten-create')!
const healthProbe = API_CATALOG.find((e) => e.id === 'health-probe')!

describe('resolveCredential', () => {
  it('falls back to a placeholder instead of leaking an empty header', () => {
    expect(resolveCredential('')).toBe('qlk_live_your_api_key')
    expect(resolveCredential('   ')).toBe('qlk_live_your_api_key')
    expect(resolveCredential('  qlk_abc  ')).toBe('qlk_abc')
  })
})

describe('authHeaderName', () => {
  it('uses x-api-key by default', () => {
    expect(authHeaderName(shortenCreate)).toBe('x-api-key')
  })

  it('routes the health probe to the management-token header the route enforces', () => {
    expect(authHeaderName(healthProbe)).toBe('x-management-token')
  })
})

describe('buildAuthHeaders', () => {
  it('omits the credential header when empty so anonymous behavior is explorable', () => {
    expect(buildAuthHeaders(shortenCreate, '')).toEqual({})
  })

  it('sends the management token header for the health probe', () => {
    expect(buildAuthHeaders(healthProbe, 'tok_123')).toEqual({ 'x-management-token': 'tok_123' })
  })

  it('only sets Content-Type for body-carrying requests', () => {
    expect(buildAuthHeaders(shortenCreate, 'qlk_x', { includeContentType: true })).toEqual({
      'Content-Type': 'application/json',
      'x-api-key': 'qlk_x',
    })
    const list = API_CATALOG.find((e) => e.id === 'shorten-list')!
    expect(buildAuthHeaders(list, 'qlk_x')).toEqual({ 'x-api-key': 'qlk_x' })
  })
})
