import { describe, expect, it } from 'vitest'
import {
  collapseJsonWhitespace,
  escapeForCurlSingleQuotes,
  escapeForGoRawString,
  generateCodeSample,
  jsonToPythonLiteral,
} from './sampleGenerators'

const BODY = JSON.stringify({ url: 'https://example.com/x', tags: ['a', 'b'] }, null, 2)

describe('escapeForCurlSingleQuotes', () => {
  it('escapes single quotes so the -d string stays intact', () => {
    expect(escapeForCurlSingleQuotes(`it's "quoted"`)).toBe(`it'\\''s "quoted"`)
  })
})

describe('collapseJsonWhitespace', () => {
  it('flattens pretty JSON onto one line', () => {
    expect(collapseJsonWhitespace('{\n  "a": 1\n}')).toBe('{ "a": 1 }')
  })
})

describe('jsonToPythonLiteral', () => {
  it('converts JSON literals to valid Python', () => {
    expect(jsonToPythonLiteral('{"a": true, "b": false, "c": null, "d": [1, "x"]}')).toBe(
      '{"a": True, "b": False, "c": None, "d": [1, "x"]}',
    )
  })

  it('returns null for invalid JSON instead of emitting broken Python', () => {
    expect(jsonToPythonLiteral('{nope')).toBe(null)
  })
})

describe('escapeForGoRawString', () => {
  it('splices backticks out of raw string literals', () => {
    expect(escapeForGoRawString('a`b')).toBe('a` + "`" + `b')
  })

  it('leaves ordinary JSON untouched', () => {
    expect(escapeForGoRawString('{"a": 1}')).toBe('{"a": 1}')
  })
})

describe('generateCodeSample', () => {
  it('curl sends the placeholder key and escapes quote payloads', () => {
    const out = generateCodeSample({
      lang: 'curl',
      method: 'POST',
      fullUrl: 'https://x.test/api/shorten',
      apiKey: '',
      bodyText: `{"title": "it's live"}`,
      authHeader: 'x-api-key',
    })
    expect(out).toContain('x-api-key: qlk_live_your_api_key')
    expect(out).toContain(`-d '{"title": "it'\\''s live"}'`)
  })

  it('node omits Content-Type for GET requests', () => {
    const out = generateCodeSample({
      lang: 'node',
      method: 'GET',
      fullUrl: 'https://x.test/api/shorten',
      apiKey: 'qlk_1',
      bodyText: '',
      authHeader: 'x-api-key',
    })
    expect(out).not.toContain('Content-Type')
    expect(out).toContain('"x-api-key": "qlk_1"')
  })

  it('python emits runnable literals instead of raw JSON', () => {
    const out = generateCodeSample({
      lang: 'python',
      method: 'POST',
      fullUrl: 'https://x.test/api/shorten',
      apiKey: 'qlk_1',
      bodyText: '{"ok": true, "n": null}',
      authHeader: 'x-api-key',
    })
    expect(out).toContain('payload = {"ok": True, "n": None}')
    expect(out).toContain('requests.post(url, json=payload, headers=headers)')
  })

  it('python flags invalid JSON instead of emitting a syntax error', () => {
    const out = generateCodeSample({
      lang: 'python',
      method: 'POST',
      fullUrl: 'https://x.test/api/shorten',
      apiKey: 'qlk_1',
      bodyText: '{broken',
      authHeader: 'x-api-key',
    })
    expect(out).toContain('not valid JSON')
  })

  it('go sends the JSON payload instead of a nil body', () => {
    const out = generateCodeSample({
      lang: 'go',
      method: 'POST',
      fullUrl: 'https://x.test/api/shorten',
      apiKey: 'qlk_1',
      bodyText: BODY,
      authHeader: 'x-api-key',
    })
    expect(out).toContain('bytes.NewBufferString')
    expect(out).not.toContain('http.NewRequest("POST", "https://x.test/api/shorten", nil)')
    expect(out).toContain('Content-Type')
  })

  it('go keeps GET requests bodiless', () => {
    const out = generateCodeSample({
      lang: 'go',
      method: 'GET',
      fullUrl: 'https://x.test/api/links/demo',
      apiKey: 'qlk_1',
      bodyText: BODY,
      authHeader: 'x-api-key',
    })
    expect(out).toContain(', nil)')
    expect(out).not.toContain('bytes.')
  })

  it('uses the management-token header for the health probe', () => {
    const out = generateCodeSample({
      lang: 'curl',
      method: 'POST',
      fullUrl: 'https://x.test/api/links/demo/health',
      apiKey: 'tok_1',
      bodyText: '{"target":"fallback"}',
      authHeader: 'x-management-token',
    })
    expect(out).toContain('x-management-token: tok_1')
  })
})
