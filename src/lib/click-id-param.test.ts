import { describe, expect, it } from 'vitest'
import { appendClickId, parseClickIdParam } from './click-id-param'

describe('parseClickIdParam', () => {
  it('disables on empty', () => { for (const v of [null, undefined, '', '  ']) expect(parseClickIdParam(v)).toBeNull() })
  it('accepts valid names', () => { expect(parseClickIdParam(' ql_id ')).toBe('ql_id'); expect(parseClickIdParam('clickid')).toBe('clickid') })
  it('rejects bad names', () => {
    for (const v of ['1abc', 'a-b', 'a b', 'a=b', 'a&b', 'x'.repeat(33)]) expect(() => parseClickIdParam(v)).toThrow()
    expect(() => parseClickIdParam(5)).toThrow('string')
  })
  it('rejects reserved names case-insensitively', () => { expect(() => parseClickIdParam('Token')).toThrow('reserved'); expect(() => parseClickIdParam('ql_attribution')).toThrow('reserved') })
})

describe('appendClickId', () => {
  it('appends and preserves query and hash', () => {
    expect(appendClickId('https://a.com/p?x=1#h', 'cid', 'abc')).toBe('https://a.com/p?x=1&cid=abc#h')
  })
  it('replaces a stale value', () => { expect(appendClickId('https://a.com/?cid=old', 'cid', 'new')).toBe('https://a.com/?cid=new') })
  it('no-ops when disabled or non-http', () => {
    expect(appendClickId('https://a.com/', null, 'x')).toBe('https://a.com/')
    expect(appendClickId('myapp://open', 'cid', 'x')).toBe('myapp://open')
    expect(appendClickId('not a url', 'cid', 'x')).toBe('not a url')
  })
})
