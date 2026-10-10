import { describe, expect, it } from 'vitest'
import { computeReward, resolveReward, matchRule, validateRule, type RewardRule } from './reward-rules'

const pro: RewardRule = { id: 'pro', key: 'plan', equals: ['pro', 'team'], type: 'percent', amount: 3000 }
const any: RewardRule = { id: 'flat', key: 'plan', equals: ['pro'], type: 'flat', amount: 500, priority: -1 }

describe('reward rules', () => {
  it('matches by metadata value', () => {
    expect(matchRule([pro], { plan: 'team' })?.id).toBe('pro')
    expect(matchRule([pro], { plan: 'free' })).toBeNull()
    expect(matchRule([pro], { plan: { a: 1 } })).toBeNull()
  })
  it('lower priority number wins, ties keep order', () => {
    expect(matchRule([pro, any], { plan: 'pro' })?.id).toBe('flat')
  })
  it('computes percent and caps flat at sale value', () => {
    expect(computeReward(10_000, { plan: 'pro' }, [pro], null)).toEqual({ cents: 3000, ruleId: 'pro' })
    expect(computeReward(300, { plan: 'pro' }, [any], null).cents).toBe(300)
  })
  it('falls back and handles bad input', () => {
    expect(computeReward(10_000, {}, [pro], { type: 'percent', amount: 1000 })).toEqual({ cents: 1000, ruleId: null })
    expect(computeReward(0, { plan: 'pro' }, [pro], null).cents).toBe(0)
    expect(validateRule({ ...pro, amount: 10_001 })).toMatch(/exceeds/)
  })
})

describe('resolveReward scopes', () => {
  const rule = { id: 'r', key: 'plan', equals: ['pro'], type: 'percent' as const, amount: 2000 }
  it('link scope beats partner and program', () => {
    const r = resolveReward(10000, { plan: 'pro' }, [
      { rules: [rule] },
      { fallback: { type: 'flat', amount: 500 } },
      { fallback: { type: 'percent', amount: 1000 } },
    ])
    expect(r).toEqual({ cents: 2000, ruleId: 'r', scopeIndex: 0 })
  })
  it('falls through to the first scope with a fallback', () => {
    const r = resolveReward(10000, { plan: 'free' }, [
      { rules: [rule] },
      { fallback: { type: 'flat', amount: 500 } },
      { fallback: { type: 'percent', amount: 1000 } },
    ])
    expect(r).toEqual({ cents: 500, ruleId: null, scopeIndex: 1 })
  })
  it('returns zero when no scope applies', () => {
    expect(resolveReward(10000, {}, [{ rules: [rule] }, {}])).toEqual({ cents: 0, ruleId: null, scopeIndex: null })
  })
})


import { parseRules as parseRulesFn } from './reward-rules'
import { describe as d2, it as it2, expect as expect2 } from 'vitest'

d2('parseRules', () => {
  const ok = { id: 'a', key: 'plan', equals: ['pro', 3], type: 'percent', amount: 1000 }
  it2('normalizes valid rules', () => {
    expect2(parseRulesFn([ok])).toEqual({ rules: [{ ...ok, equals: ['pro', '3'] }] })
  })
  it2('rejects bad shapes with index', () => {
    expect2(parseRulesFn('x')).toEqual({ error: 'rules must be an array' })
    expect2(parseRulesFn([ok, ok])).toEqual({ error: 'rules[1].id is duplicated' })
    expect2(parseRulesFn([{ ...ok, type: 'x' }])).toEqual({ error: 'rules[0].type must be percent or flat' })
    expect2(parseRulesFn([{ ...ok, amount: 20000 }])).toEqual({ error: 'rules[0]: percent exceeds 10000 basis points' })
    expect2(parseRulesFn([{ ...ok, equals: [{}] }])).toEqual({ error: 'rules[0].equals must be an array of scalars' })
  })
  it2('caps rule count', () => {
    const many = Array.from({ length: 26 }, (_, i) => ({ ...ok, id: `r${i}` }))
    expect2(parseRulesFn(many)).toEqual({ error: 'at most 25 rules per scope' })
  })
})

import { simulateRewards } from './reward-rules'

describe('simulateRewards', () => {
  it('previews each sample against ordered scopes', () => {
    const rule = { id: 'pro', key: 'plan', equals: ['pro'], type: 'percent' as const, amount: 2000 }
    const out = simulateRewards(
      [
        { saleValueCents: 10000, metadata: { plan: 'pro' } },
        { saleValueCents: 10000, metadata: { plan: 'free' } },
      ],
      [{ rules: [rule] }, { fallback: { type: 'flat', amount: 500 } }],
    )
    expect(out).toEqual([
      { cents: 2000, ruleId: 'pro', scopeIndex: 0 },
      { cents: 500, ruleId: null, scopeIndex: 1 },
    ])
  })
})
