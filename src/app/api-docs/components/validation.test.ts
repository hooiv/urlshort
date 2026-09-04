import { describe, expect, it } from 'vitest'
import {
  endpointHasBody,
  getResponseErrorMessage,
  validateJsonBody,
  validatePathParams,
} from './validation'
import { API_CATALOG } from './apiCatalog'

const linkDetail = API_CATALOG.find((e) => e.id === 'link-detail')!
const shortenCreate = API_CATALOG.find((e) => e.id === 'shorten-create')!
const shortenList = API_CATALOG.find((e) => e.id === 'shorten-list')!

describe('validateJsonBody', () => {
  it('accepts valid JSON payloads', () => {
    expect(validateJsonBody('{"a": 1}', true)).toEqual({ ok: true })
  })

  it('rejects malformed JSON with an actionable message', () => {
    const result = validateJsonBody('{broken', true)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/valid JSON/)
  })

  it('requires a body for POST/PATCH endpoints', () => {
    expect(validateJsonBody('   ', true).ok).toBe(false)
  })

  it('allows empty bodies where no payload is sent', () => {
    expect(validateJsonBody('', false)).toEqual({ ok: true })
  })
})

describe('validatePathParams', () => {
  it('passes when every placeholder resolves', () => {
    expect(validatePathParams(linkDetail, { shortCode: 'abc' })).toEqual({ ok: true, missing: [] })
  })

  it('reports placeholders with no value and no default', () => {
    const noDefault = { ...linkDetail, pathParams: [{ name: 'shortCode', placeholder: 'x', default: '' }] }
    expect(validatePathParams(noDefault, { shortCode: '  ' })).toEqual({ ok: false, missing: ['shortCode'] })
  })

  it('treats spec defaults as satisfying the placeholder', () => {
    expect(validatePathParams(linkDetail, {}).ok).toBe(true)
  })
})

describe('endpointHasBody', () => {
  it('mirrors the rendered JSON editor', () => {
    expect(endpointHasBody(shortenCreate)).toBe(true)
    expect(endpointHasBody(shortenList)).toBe(false)
  })
})

describe('getResponseErrorMessage', () => {
  it('extracts string error fields', () => {
    expect(getResponseErrorMessage({ error: 'Nope' }, 'fallback')).toBe('Nope')
  })

  it('falls back for null, primitives, and non-string errors', () => {
    expect(getResponseErrorMessage(null, 'fallback')).toBe('fallback')
    expect(getResponseErrorMessage('oops', 'fallback')).toBe('fallback')
    expect(getResponseErrorMessage({ error: 42 }, 'fallback')).toBe('fallback')
    expect(getResponseErrorMessage({ error: '  ' }, 'fallback')).toBe('fallback')
  })
})
