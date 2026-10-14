import { describe, expect, it } from 'vitest'
import { applyAutoTagRules, autoTagRulesSchema, hostMatches, ruleMatches } from './auto-tag-rules'

describe('hostMatches', () => {
  it('matches apex and subdomains', () => {
    expect(hostMatches('example.com', 'example.com')).toBe(true)
    expect(hostMatches('example.com', 'blog.example.com')).toBe(true)
    expect(hostMatches('example.com', 'notexample.com')).toBe(false)
  })
  it('wildcard matches subdomains only', () => {
    expect(hostMatches('*.example.com', 'a.example.com')).toBe(true)
    expect(hostMatches('*.example.com', 'example.com')).toBe(false)
  })
  it('tolerates scheme and path in the pattern', () => {
    expect(hostMatches('https://Example.com/x', 'example.com')).toBe(true)
  })
})

describe('ruleMatches', () => {
  it('requires every given condition', () => {
    const r = { host: 'shop.com', pathContains: '/SALE', tags: ['sale'] }
    expect(ruleMatches(r, 'https://shop.com/sale/1')).toBe(true)
    expect(ruleMatches(r, 'https://shop.com/new')).toBe(false)
    expect(ruleMatches(r, 'https://other.com/sale')).toBe(false)
  })
  it('matches query string and rejects invalid URLs', () => {
    expect(ruleMatches({ pathContains: 'ref=ig', tags: ['ig'] }, 'https://a.com/?ref=IG')).toBe(true)
    expect(ruleMatches({ host: 'a.com', tags: ['x'] }, 'not a url')).toBe(false)
  })
})

describe('applyAutoTagRules', () => {
  const rules = [
    { host: 'youtube.com', tags: ['Video', 'social'] },
    { host: 'youtu.be', tags: ['video'] },
  ]
  it('merges, dedupes and reports only newly added tags', () => {
    const out = applyAutoTagRules(rules, 'https://www.youtube.com/watch?v=1', ['social'])
    expect(out.tags.sort()).toEqual(['social', 'video'])
    expect(out.added).toEqual(['video'])
  })
  it('is a no-op without matches', () => {
    expect(applyAutoTagRules(rules, 'https://x.com', ['a'])).toEqual({ tags: ['a'], added: [] })
  })
})

describe('schema', () => {
  it('rejects rules with no condition and caps count', () => {
    expect(autoTagRulesSchema.safeParse([{ tags: ['a'] }]).success).toBe(false)
    expect(autoTagRulesSchema.safeParse(Array(51).fill({ host: 'a.com', tags: ['a'] })).success).toBe(false)
    expect(autoTagRulesSchema.safeParse([{ host: 'a.com', tags: ['a'] }]).success).toBe(true)
  })
})
