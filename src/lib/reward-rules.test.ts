import { describe, expect, it } from 'vitest'
import { parseRules, findShadowedRules } from './reward-rules'
import { computeReward, describeRule, resolveReward, matchRule, validateRule, type RewardRule } from './reward-rules'

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

describe('capCents', () => {
  it('caps percent commissions and validates the cap', () => {
    const rule = { id: 'pro', key: 'plan', equals: ['pro'], type: 'percent' as const, amount: 5000, capCents: 1500 }
    expect(computeReward(10000, { plan: 'pro' }, [rule], null).cents).toBe(1500)
    expect(computeReward(2000, { plan: 'pro' }, [rule], null).cents).toBe(1000)
    expect(computeReward(10000, {}, [], { type: 'percent', amount: 5000, capCents: 100 }).cents).toBe(100)
    expect(parseRules([{ ...rule, capCents: -1 }])).toEqual({ error: 'rules[0].capCents must be a non-negative integer' })
    expect(parseRules([rule])).toEqual({ rules: [rule] })
  })
})

import { parseDefault as parseDefaultFn } from './reward-rules'
describe('parseDefault', () => {
  it('accepts null and valid defaults, dropping unknown keys', () => {
    expect(parseDefaultFn(null)).toEqual({ fallback: null })
    expect(parseDefaultFn({ type: 'percent', amount: 1500, capCents: 500, junk: 1 })).toEqual({
      fallback: { type: 'percent', amount: 1500, capCents: 500 },
    })
  })
  it('rejects malformed defaults', () => {
    for (const bad of ['x', [], { type: 'x', amount: 1 }, { type: 'flat', amount: -1 }, { type: 'flat', amount: 1.5 },
      { type: 'percent', amount: 10001 }, { type: 'flat', amount: 1, capCents: -1 }]) {
      expect('error' in parseDefaultFn(bad)).toBe(true)
    }
  })
})

describe('minSaleCents', () => {
  const big = { id: 'big', key: 'plan', equals: ['pro'], type: 'percent' as const, amount: 3000, minSaleCents: 5000, priority: 0 }
  const any = { id: 'any', key: 'plan', equals: ['pro'], type: 'percent' as const, amount: 1000, priority: 1 }
  it('skips rules below the sale threshold and falls through', () => {
    expect(computeReward(10000, { plan: 'pro' }, [big, any], null)).toEqual({ cents: 3000, ruleId: 'big' })
    expect(computeReward(4000, { plan: 'pro' }, [big, any], null)).toEqual({ cents: 400, ruleId: 'any' })
  })
  it('validates the field', () => {
    expect('error' in parseRules([{ ...big, minSaleCents: -5 }])).toBe(true)
    expect(parseRules([big])).toEqual({ rules: [big] })
  })
})

describe('maxSaleCents band', () => {
  const band: RewardRule = { id: 'small', key: 'plan', equals: ['pro'], type: 'flat', amount: 100, minSaleCents: 100, maxSaleCents: 1000 }
  it('only matches inside the band', () => {
    expect(matchRule([band], { plan: 'pro' }, 1000)?.id).toBe('small')
    expect(matchRule([band], { plan: 'pro' }, 1001)).toBeNull()
    expect(matchRule([band], { plan: 'pro' }, 99)).toBeNull()
  })
  it('parseRules validates the band', () => {
    const base = { id: 'a', key: 'plan', equals: ['pro'], type: 'flat', amount: 1 }
    expect('error' in parseRules([{ ...base, maxSaleCents: -1 }])).toBe(true)
    expect('error' in parseRules([{ ...base, minSaleCents: 5, maxSaleCents: 4 }])).toBe(true)
    const ok = parseRules([{ ...base, minSaleCents: 5, maxSaleCents: 50 }])
    expect('rules' in ok && ok.rules[0].maxSaleCents).toBe(50)
  })
})

describe('findShadowedRules', () => {
  const mk = (id: string, equals: string[], extra: Partial<RewardRule> = {}): RewardRule => ({ id, key: 'plan', equals, type: 'flat', amount: 1, ...extra })
  it('flags a later rule fully covered by an earlier one', () => {
    expect(findShadowedRules([mk('a', ['pro', 'team']), mk('b', ['pro'])])).toEqual([{ ruleId: 'b', shadowedBy: 'a' }])
  })
  it('respects priority ordering', () => {
    expect(findShadowedRules([mk('a', ['pro']), mk('b', ['pro', 'team'], { priority: -1 })])).toEqual([{ ruleId: 'a', shadowedBy: 'b' }])
  })
  it('does not flag when bands differ or values are not covered', () => {
    expect(findShadowedRules([mk('a', ['pro'], { minSaleCents: 100 }), mk('b', ['pro'])])).toEqual([])
    expect(findShadowedRules([mk('a', ['pro']), mk('b', ['pro', 'team'])])).toEqual([])
    expect(findShadowedRules([mk('a', ['pro'], { maxSaleCents: 50 }), mk('b', ['pro'], { maxSaleCents: 500 })])).toEqual([])
  })
})

describe('resolveReward band fall-through', () => {
  it('falls through to the next scope when the link rule band excludes the sale', () => {
    const linkRule: RewardRule = { id: 'l', key: 'plan', equals: ['pro'], type: 'flat', amount: 500, minSaleCents: 10_000 }
    const out = resolveReward(5_000, { plan: 'pro' }, [
      { rules: [linkRule] },
      { fallback: { type: 'flat', amount: 100 } },
    ])
    expect(out).toEqual({ cents: 100, ruleId: null, scopeIndex: 1 })
  })
})


describe('describeRule', () => {
  it('describes percent rule with band and cap', () => {
    expect(
      describeRule({ id: 'a', key: 'plan', equals: ['pro', 'team'], type: 'percent', amount: 2550, minSaleCents: 1000, maxSaleCents: 50000, capCents: 5000 }),
    ).toBe('25.5% when plan is "pro" or "team", for sales of $10.00 to $500.00, capped at $50.00')
  })
  it('describes flat rule with only a minimum', () => {
    expect(describeRule({ id: 'b', key: 'tier', equals: ['gold'], type: 'flat', amount: 1500, minSaleCents: 100 })).toBe(
      '$15.00 when tier is "gold", for sales of at least $1.00',
    )
  })
})
