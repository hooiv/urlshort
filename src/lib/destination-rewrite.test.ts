import { describe, expect, it } from 'vitest'
import { rewriteDestination, validateRewriteSpec } from './destination-rewrite'

describe('rewriteDestination', () => {
  it('swaps host and subdomains keeping path and query', () => {
    expect(rewriteDestination('https://old.com/a?x=1', { mode: 'host', from: 'old.com', to: 'new.com' })).toEqual({ changed: true, url: 'https://new.com/a?x=1' })
    expect(rewriteDestination('https://shop.old.com/a', { mode: 'host', from: 'old.com', to: 'new.com' })).toEqual({ changed: true, url: 'https://shop.new.com/a' })
  })
  it('does not match lookalike hosts', () => {
    expect(rewriteDestination('https://notold.com/a', { mode: 'host', from: 'old.com', to: 'new.com' })).toEqual({ changed: false })
  })
  it('rewrites a path prefix on a segment boundary only', () => {
    const spec = { mode: 'prefix', host: 'example.com', from: '/blog', to: '/articles' } as const
    expect(rewriteDestination('https://example.com/blog/post?a=1', spec)).toEqual({ changed: true, url: 'https://example.com/articles/post?a=1' })
    expect(rewriteDestination('https://example.com/blogger', spec)).toEqual({ changed: false })
    expect(rewriteDestination('https://other.com/blog/post', spec)).toEqual({ changed: false })
  })
  it('does literal text replacement without regex semantics', () => {
    expect(rewriteDestination('https://example.com/a.b?c=a.b', { mode: 'text', find: 'a.b', replace: 'z' })).toEqual({ changed: true, url: 'https://example.com/z?c=z' })
    expect(rewriteDestination('https://example.com/axb', { mode: 'text', find: 'a.b', replace: 'z' })).toEqual({ changed: false })
  })
  it('refuses non-http results and newly risky destinations', () => {
    expect(rewriteDestination('https://example.com/a', { mode: 'text', find: 'https://', replace: 'javascript:' })).toHaveProperty('error')
    expect(rewriteDestination('https://example.com/a', { mode: 'host', from: 'example.com', to: '10.0.0.1' })).toHaveProperty('error')
  })
  it('refuses oversized results', () => {
    expect(rewriteDestination('https://example.com/a', { mode: 'text', find: 'a', replace: 'b'.repeat(500) + '' })).toHaveProperty('changed')
    const long = 'https://example.com/' + 'a'.repeat(2000)
    expect(rewriteDestination(long, { mode: 'text', find: 'a', replace: 'aa' })).toHaveProperty('error')
  })
  it('validates specs', () => {
    expect(validateRewriteSpec({ mode: 'host', from: 'https://x', to: 'y.com' })).toMatch(/hostname/)
    expect(validateRewriteSpec({ mode: 'prefix', from: '/', to: '/x' })).toMatch(/broad/)
    expect(validateRewriteSpec({ mode: 'text', find: '', replace: 'x' })).toMatch(/empty/)
    expect(validateRewriteSpec({ mode: 'host', from: 'a.com', to: 'b.com' })).toBeNull()
  })
})
