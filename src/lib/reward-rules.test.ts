import { describe, expect, it } from 'vitest'
import { parseRules, findShadowedRules } from './reward-rules'
import { describeDefault, computeReward, describeRule, resolveReward, matchRule, validateRule, type RewardRule } from './reward-rules'

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
  it2('bounds priority magnitude', () => {
    expect2(parseRulesFn([{ ...ok, priority: 2_000_000 }])).toEqual({ error: 'rules[0].priority must be within ±1000000' })
    expect2('rules' in parseRulesFn([{ ...ok, priority: -1_000_000 }])).toBe(true)
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

describe('parseRules size limits', () => {
  const base = { key: 'plan', equals: ['pro'], type: 'percent', amount: 1000 }
  it('rejects overlong ids', () => {
    expect(parseRules([{ ...base, id: 'x'.repeat(65) }])).toEqual({ error: 'rules[0].id must be at most 64 characters' })
  })
  it('rejects oversized equals lists', () => {
    const equals = Array.from({ length: 51 }, (_, i) => String(i))
    expect(parseRules([{ ...base, id: 'a', equals }])).toEqual({ error: 'rules[0].equals allows at most 50 values' })
  })
  it('accepts boundary sizes', () => {
    const equals = Array.from({ length: 50 }, (_, i) => String(i))
    expect('rules' in parseRules([{ ...base, id: 'x'.repeat(64), equals }])).toBe(true)
  })
})

describe('parseRules key bounds', () => {
  const base = { id: 'a', equals: ['pro'], type: 'percent', amount: 1000 }
  it('rejects blank keys', () => {
    expect(parseRules([{ ...base, key: '  ' }])).toEqual({ error: 'rules[0].key must be a non-empty string' })
  })
  it('rejects overlong keys', () => {
    expect(parseRules([{ ...base, key: 'k'.repeat(65) }])).toEqual({ error: 'rules[0].key must be at most 64 characters' })
  })
})

describe('parseRules equals value length', () => {
  it('rejects values over 256 characters', () => {
    const r = parseRules([{ id: 'a', key: 'plan', equals: ['x'.repeat(257)], type: 'flat', amount: 100 }])
    expect(r).toEqual({ error: 'rules[0].equals values must be at most 256 characters' })
  })
  it('accepts exactly 256 characters', () => {
    const r = parseRules([{ id: 'a', key: 'plan', equals: ['x'.repeat(256)], type: 'flat', amount: 100 }])
    expect('rules' in r).toBe(true)
  })
})

describe('diffRules', () => {
  const base = { key: 'plan', equals: ['pro'], type: 'percent' as const, amount: 1000 }
  it('reports added, removed and changed rules by id', async () => {
    const { diffRules } = await import('./reward-rules')
    const out = diffRules(
      [{ id: 'a', ...base }, { id: 'b', ...base }, { id: 'c', ...base }],
      [{ id: 'a', ...base }, { id: 'b', ...base, amount: 2000 }, { id: 'd', ...base }],
    )
    expect(out).toEqual({ added: ['d'], removed: ['c'], changed: ['b'] })
  })
  it('is empty for identical sets', async () => {
    const { diffRules } = await import('./reward-rules')
    expect(diffRules([{ id: 'a', ...base }], [{ id: 'a', ...base }])).toEqual({ added: [], removed: [], changed: [] })
  })
})

describe('diffRules value order', () => {
  it('ignores reordering of equals values', async () => {
    const { diffRules } = await import('./reward-rules')
    const mk = (equals: string[]) => [{ id: 'a', key: 'plan', equals, type: 'percent' as const, amount: 1000 }]
    expect(diffRules(mk(['pro', 'team']), mk(['team', 'pro']))).toEqual({ added: [], removed: [], changed: [] })
  })
})

describe('parseRules unsafe integers', () => {
  const base = { id: 'a', key: 'plan', equals: ['pro'], type: 'flat', amount: 100 }
  it.each(['capCents', 'minSaleCents', 'maxSaleCents', 'amount'])('rejects %s beyond the safe integer range', (field) => {
    const res = parseRules([{ ...base, [field]: 1e300 }])
    expect('error' in res).toBe(true)
  })
})

describe('parseRules numeric edge cases', () => {
  const base = { id: 'a', key: 'plan', equals: ['pro'], type: 'flat', amount: 100 }
  it('rejects NaN and fractional amounts', () => {
    expect('error' in parseRules([{ ...base, amount: NaN }])).toBe(true)
    expect('error' in parseRules([{ ...base, amount: 1.5 }])).toBe(true)
  })
  it('rejects infinite priority', () => {
    expect(parseRules([{ ...base, priority: Infinity }])).toEqual({ error: 'rules[0].priority must be a number' })
  })
  it('rejects empty equals', () => {
    expect('error' in parseRules([{ ...base, equals: [] }])).toBe(true)
  })
})

describe('describeDefault', () => {
  it('describes percent and flat defaults with optional cap', () => {
    expect(describeDefault({ type: 'percent', amount: 1250 })).toBe('12.5% on every other sale')
    expect(describeDefault({ type: 'flat', amount: 500, capCents: 500 })).toBe('$5.00 on every other sale, capped at $5.00')
  })
})

describe('parseRules equals normalisation', () => {
  it('dedupes equals values after string coercion', () => {
    const out = parseRules([{ id: 'a', key: 'plan', equals: ['1', 1, 'pro', 'pro'], type: 'flat', amount: 100 }])
    expect('rules' in out && out.rules[0].equals).toEqual(['1', 'pro'])
  })
})

describe('findShadowedRules priority ordering', () => {
  it('lets a lower priority number shadow a later-listed broader rule', () => {
    const broad = { id: 'broad', key: 'plan', equals: ['pro', 'team'], type: 'flat' as const, amount: 100, priority: 0 }
    const narrow = { id: 'narrow', key: 'plan', equals: ['pro'], type: 'flat' as const, amount: 500, priority: 1 }
    expect(findShadowedRules([narrow, broad])).toEqual([{ ruleId: 'narrow', shadowedBy: 'broad' }])
  })
  it('does not flag a narrower rule that runs first', () => {
    const broad = { id: 'broad', key: 'plan', equals: ['pro', 'team'], type: 'flat' as const, amount: 100, priority: 1 }
    const narrow = { id: 'narrow', key: 'plan', equals: ['pro'], type: 'flat' as const, amount: 500, priority: 0 }
    expect(findShadowedRules([broad, narrow])).toEqual([])
  })
})

describe('diffRules equals ordering', () => {
  it('does not flag a rule whose equals values were only reordered', async () => {
    const { diffRules } = await import('./reward-rules')
    const a: RewardRule = { id: 'x', key: 'plan', equals: ['pro', 'team'], type: 'flat', amount: 500 }
    const b: RewardRule = { ...a, equals: ['team', 'pro'] }
    expect(diffRules([a], [b])).toEqual({ added: [], removed: [], changed: [] })
  })
  it('flags a cap change', async () => {
    const { diffRules } = await import('./reward-rules')
    const a: RewardRule = { id: 'x', key: 'plan', equals: ['pro'], type: 'percent', amount: 1000 }
    expect(diffRules([a], [{ ...a, capCents: 900 }]).changed).toEqual(['x'])
  })
})

describe('computeReward bounds', () => {
  it('never pays more than the sale value for a flat reward', async () => {
    const { computeReward } = await import('./reward-rules')
    expect(computeReward(300, {}, [], { type: 'flat', amount: 500 })).toEqual({ cents: 300, ruleId: null })
  })
  it('applies the cap to percent rewards and floors fractions', async () => {
    const { computeReward } = await import('./reward-rules')
    expect(computeReward(10_000, {}, [], { type: 'percent', amount: 5000, capCents: 1200 }).cents).toBe(1200)
    expect(computeReward(999, {}, [], { type: 'percent', amount: 1000 }).cents).toBe(99)
  })
  it('returns zero for non-positive sales', async () => {
    const { computeReward } = await import('./reward-rules')
    expect(computeReward(0, {}, [], { type: 'flat', amount: 100 }).cents).toBe(0)
  })
})

import { explainMatch as explainMatchFn } from './reward-rules'
describe('explainMatch', () => {
  const base = { key: 'plan', equals: ['pro'], type: 'percent' as const, amount: 1000 }
  it('reports each rule in priority order with reasons', () => {
    const out = explainMatchFn(
      [
        { ...base, id: 'b', priority: 2 },
        { ...base, id: 'a', priority: 1, minSaleCents: 5000 },
      ],
      { plan: 'pro' },
      1000,
    )
    expect(out.map((o) => o.ruleId)).toEqual(['a', 'b'])
    expect(out[0]).toMatchObject({ matched: false, reason: 'sale below minimum of 5000 cents' })
    expect(out[1].matched).toBe(true)
  })
  it('flags missing and non-scalar metadata', () => {
    const [m] = explainMatchFn([{ ...base, id: 'a' }], {})
    expect(m.reason).toContain('missing')
    const [o] = explainMatchFn([{ ...base, id: 'a' }], { plan: { x: 1 } })
    expect(o.reason).toContain('not a scalar')
  })
})

import { validateRule as validateRuleBounds } from './reward-rules'
describe('validateRule sale bounds', () => {
  const base = { id: 'r', key: 'plan', equals: ['pro'], type: 'flat' as const, amount: 100 }
  it('rejects min greater than max', () => {
    expect(validateRuleBounds({ ...base, minSaleCents: 500, maxSaleCents: 100 })).toMatch(/cannot exceed/)
  })
  it('accepts equal bounds', () => {
    expect(validateRuleBounds({ ...base, minSaleCents: 100, maxSaleCents: 100 })).toBeNull()
  })
})
