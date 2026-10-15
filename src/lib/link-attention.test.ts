import { describe, expect, it } from 'vitest'
import { ATTENTION_ISSUES, issuePredicate, parseAttentionIssue, parseAttentionLimit } from './link-attention'

describe('link attention', () => {
  it('parses issues strictly', () => {
    expect(parseAttentionIssue('down')).toBe('down')
    expect(parseAttentionIssue('nope')).toBeNull()
    expect(parseAttentionIssue(null)).toBeNull()
  })
  it('parses limits', () => {
    expect(parseAttentionLimit(null)).toBe(25)
    expect(parseAttentionLimit('100')).toBe(100)
    for (const bad of ['0', '101', '-1', '1.5', 'x']) expect(parseAttentionLimit(bad)).toBeNull()
  })
  it('builds a predicate for every issue with bound dates', () => {
    const now = new Date('2026-10-15T00:00:00Z')
    for (const i of ATTENTION_ISSUES) expect(issuePredicate(i, now).sql.length).toBeGreaterThan(10)
    expect(issuePredicate('expiringSoon', now).values[1]).toEqual(new Date('2026-10-22T00:00:00Z'))
  })
})
