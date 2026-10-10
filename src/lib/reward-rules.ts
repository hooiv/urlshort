/**
 * Metadata-based reward rules: pick a commission for a sale from the
 * sale's metadata (e.g. plan=pro) with link-level overrides taking priority.
 * Pure and deterministic so it can be reused by webhook and API paths.
 */
export type RewardType = 'percent' | 'flat'

export type RewardRule = {
  id: string
  /** Metadata key to inspect (case-sensitive). */
  key: string
  /** Matches when the metadata value equals any of these (string-compared). */
  equals: string[]
  type: RewardType
  /** percent: basis points (1000 = 10%); flat: cents. */
  amount: number
  /** Lower number wins. */
  priority?: number
  /** Max commission per sale in cents. */
  capCents?: number
  /** Rule only applies to sales of at least this many cents. */
  minSaleCents?: number
  /** Rule only applies to sales of at most this many cents. */
  maxSaleCents?: number
}

export type RewardDefault = { type: RewardType; amount: number; /** Max commission per sale in cents. */ capCents?: number }

export const MAX_PERCENT_BPS = 10_000

export function validateRule(rule: RewardRule): string | null {
  if (!rule.key.trim()) return 'key is required'
  if (rule.equals.length === 0) return 'equals needs at least one value'
  if (!Number.isSafeInteger(rule.amount) || rule.amount < 0) return 'amount must be a non-negative integer'
  if (rule.type === 'percent' && rule.amount > MAX_PERCENT_BPS) return 'percent exceeds 10000 basis points'
  return null
}

export function matchRule(rules: RewardRule[], metadata: Record<string, unknown>, saleValueCents?: number): RewardRule | null {
  const sorted = rules
    .map((rule, index) => ({ rule, index }))
    .sort((a, b) => (a.rule.priority ?? 0) - (b.rule.priority ?? 0) || a.index - b.index)
  for (const { rule } of sorted) {
    if (validateRule(rule)) continue
    if (rule.minSaleCents !== undefined && saleValueCents !== undefined && saleValueCents < rule.minSaleCents) continue
    if (rule.maxSaleCents !== undefined && saleValueCents !== undefined && saleValueCents > rule.maxSaleCents) continue
    const value = metadata[rule.key]
    if (value === undefined || value === null || typeof value === 'object') continue
    if (rule.equals.includes(String(value))) return rule
  }
  return null
}

/** Commission in cents for a sale; never exceeds the sale value. */
export function computeReward(
  saleValueCents: number,
  metadata: Record<string, unknown>,
  rules: RewardRule[],
  fallback: RewardDefault | null,
): { cents: number; ruleId: string | null } {
  if (!Number.isFinite(saleValueCents) || saleValueCents <= 0) return { cents: 0, ruleId: null }
  const rule = matchRule(rules, metadata, saleValueCents)
  const spec = rule ?? fallback
  if (!spec) return { cents: 0, ruleId: null }
  const raw = spec.type === 'percent' ? Math.floor((saleValueCents * spec.amount) / MAX_PERCENT_BPS) : spec.amount
  const cap = spec.capCents !== undefined && Number.isInteger(spec.capCents) && spec.capCents >= 0 ? spec.capCents : Infinity
  return { cents: Math.min(raw, cap, Math.floor(saleValueCents)), ruleId: rule ? rule.id : null }
}

export type RewardScope = {
  /** Rules and default for one scope; null/undefined means the scope sets nothing. */
  rules?: RewardRule[] | null
  fallback?: RewardDefault | null
}

/**
 * Resolve the commission across scopes ordered most-specific first
 * (link, then partner, then program). The first scope that either matches
 * a rule or defines a fallback decides; less specific scopes are ignored.
 */
export function resolveReward(
  saleValueCents: number,
  metadata: Record<string, unknown>,
  scopes: RewardScope[],
): { cents: number; ruleId: string | null; scopeIndex: number | null } {
  for (let i = 0; i < scopes.length; i++) {
    const scope = scopes[i]
    const rules = scope.rules ?? []
    const fallback = scope.fallback ?? null
    if (!matchRule(rules, metadata, saleValueCents) && !fallback) continue
    const { cents, ruleId } = computeReward(saleValueCents, metadata, rules, fallback)
    return { cents, ruleId, scopeIndex: i }
  }
  return { cents: 0, ruleId: null, scopeIndex: null }
}

export const MAX_RULES_PER_SCOPE = 25

/** Parse an untrusted default commission (API body or stored column). null clears it. */
export function parseDefault(input: unknown): { fallback: RewardDefault | null } | { error: string } {
  if (input === null || input === undefined) return { fallback: null }
  if (typeof input !== 'object' || Array.isArray(input)) return { error: 'default must be an object or null' }
  const d = input as Record<string, unknown>
  if (d.type !== 'percent' && d.type !== 'flat') return { error: 'default.type must be percent or flat' }
  if (typeof d.amount !== 'number' || !Number.isInteger(d.amount) || d.amount < 0)
    return { error: 'default.amount must be a non-negative integer' }
  if (d.type === 'percent' && d.amount > MAX_PERCENT_BPS) return { error: 'default percent exceeds 10000 basis points' }
  if (d.capCents !== undefined && (typeof d.capCents !== 'number' || !Number.isInteger(d.capCents) || d.capCents < 0))
    return { error: 'default.capCents must be a non-negative integer' }
  return { fallback: { type: d.type, amount: d.amount, ...(d.capCents !== undefined ? { capCents: d.capCents as number } : {}) } }
}

/**
 * Parse untrusted JSON (API body or stored column) into validated rules.
 * Returns the first error with its index so callers can reject the whole write.
 */
export function parseRules(input: unknown): { rules: RewardRule[] } | { error: string } {
  if (!Array.isArray(input)) return { error: 'rules must be an array' }
  if (input.length > MAX_RULES_PER_SCOPE) return { error: `at most ${MAX_RULES_PER_SCOPE} rules per scope` }
  const rules: RewardRule[] = []
  const ids = new Set<string>()
  for (let i = 0; i < input.length; i++) {
    const r = input[i] as Record<string, unknown> | null
    if (!r || typeof r !== 'object') return { error: `rules[${i}] must be an object` }
    if (typeof r.id !== 'string' || !r.id) return { error: `rules[${i}].id is required` }
    if (r.id.length > 64) return { error: `rules[${i}].id must be at most 64 characters` }
    if (ids.has(r.id)) return { error: `rules[${i}].id is duplicated` }
    ids.add(r.id)
    if (typeof r.key !== 'string' || !r.key.trim()) return { error: `rules[${i}].key must be a non-empty string` }
    if (r.key.length > 64) return { error: `rules[${i}].key must be at most 64 characters` }
    if (!Array.isArray(r.equals) || !r.equals.every((v) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'))
      return { error: `rules[${i}].equals must be an array of scalars` }
    if (r.equals.length > 50) return { error: `rules[${i}].equals allows at most 50 values` }
    if (r.equals.some((v) => String(v).length > 256)) return { error: `rules[${i}].equals values must be at most 256 characters` }
    if (r.type !== 'percent' && r.type !== 'flat') return { error: `rules[${i}].type must be percent or flat` }
    if (typeof r.amount !== 'number') return { error: `rules[${i}].amount must be a number` }
    if (r.priority !== undefined && (typeof r.priority !== 'number' || !Number.isFinite(r.priority)))
      return { error: `rules[${i}].priority must be a number` }
    if (r.capCents !== undefined && (typeof r.capCents !== 'number' || !Number.isSafeInteger(r.capCents) || r.capCents < 0))
      return { error: `rules[${i}].capCents must be a non-negative integer` }
    if (r.minSaleCents !== undefined && (typeof r.minSaleCents !== 'number' || !Number.isSafeInteger(r.minSaleCents) || r.minSaleCents < 0))
      return { error: `rules[${i}].minSaleCents must be a non-negative integer` }
    if (r.maxSaleCents !== undefined && (typeof r.maxSaleCents !== 'number' || !Number.isSafeInteger(r.maxSaleCents) || r.maxSaleCents < 0))
      return { error: `rules[${i}].maxSaleCents must be a non-negative integer` }
    if (r.minSaleCents !== undefined && r.maxSaleCents !== undefined && (r.minSaleCents as number) > (r.maxSaleCents as number))
      return { error: `rules[${i}].minSaleCents cannot exceed maxSaleCents` }
    const rule: RewardRule = {
      id: r.id,
      key: r.key,
      equals: r.equals.map(String),
      type: r.type,
      amount: r.amount,
      ...(r.priority !== undefined ? { priority: r.priority as number } : {}),
      ...(r.capCents !== undefined ? { capCents: r.capCents as number } : {}),
      ...(r.minSaleCents !== undefined ? { minSaleCents: r.minSaleCents as number } : {}),
      ...(r.maxSaleCents !== undefined ? { maxSaleCents: r.maxSaleCents as number } : {}),
    }
    const err = validateRule(rule)
    if (err) return { error: `rules[${i}]: ${err}` }
    rules.push(rule)
  }
  return { rules }
}

/**
 * Dry-run a rule set against sample sales so a program owner can preview
 * payouts before saving. Never throws; invalid rules are skipped like at runtime.
 */
export function simulateRewards(
  samples: { saleValueCents: number; metadata: Record<string, unknown> }[],
  scopes: RewardScope[],
): { cents: number; ruleId: string | null; scopeIndex: number | null }[] {
  return samples.map((s) => resolveReward(s.saleValueCents, s.metadata ?? {}, scopes))
}

/**
 * Finds rules that can never fire because an earlier-evaluated rule on the
 * same key already catches every sale they would match (superset of values
 * and a sale-value band that contains theirs). Helps owners clean up rule sets.
 */
export function findShadowedRules(rules: RewardRule[]): { ruleId: string; shadowedBy: string }[] {
  const ordered = rules
    .map((rule, index) => ({ rule, index }))
    .filter(({ rule }) => validateRule(rule) === null)
    .sort((a, b) => (a.rule.priority ?? 0) - (b.rule.priority ?? 0) || a.index - b.index)
    .map((x) => x.rule)
  const out: { ruleId: string; shadowedBy: string }[] = []
  for (let i = 1; i < ordered.length; i++) {
    const r = ordered[i]
    for (let j = 0; j < i; j++) {
      const e = ordered[j]
      if (e.key !== r.key) continue
      if (!r.equals.every((v) => e.equals.includes(v))) continue
      if ((e.minSaleCents ?? 0) > (r.minSaleCents ?? 0)) continue
      if ((e.maxSaleCents ?? Infinity) < (r.maxSaleCents ?? Infinity)) continue
      out.push({ ruleId: r.id, shadowedBy: e.id })
      break
    }
  }
  return out
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

/** Plain-English summary of a rule for dashboards and audit entries. */
export function describeRule(rule: RewardRule): string {
  const payout = rule.type === 'percent' ? `${(rule.amount / 100).toString()}%` : formatMoney(rule.amount)
  const values = rule.equals.map((v) => `"${v}"`).join(' or ')
  const parts = [`${payout} when ${rule.key} is ${values}`]
  if (rule.minSaleCents !== undefined && rule.maxSaleCents !== undefined)
    parts.push(`for sales of ${formatMoney(rule.minSaleCents)} to ${formatMoney(rule.maxSaleCents)}`)
  else if (rule.minSaleCents !== undefined) parts.push(`for sales of at least ${formatMoney(rule.minSaleCents)}`)
  else if (rule.maxSaleCents !== undefined) parts.push(`for sales of at most ${formatMoney(rule.maxSaleCents)}`)
  if (rule.capCents !== undefined) parts.push(`capped at ${formatMoney(rule.capCents)}`)
  return parts.join(', ')
}

/**
 * Compare two rule sets by id so audit entries can say what an edit changed.
 * A rule counts as changed when any field differs (deep compare on its JSON form).
 */
export function diffRules(before: RewardRule[], after: RewardRule[]): { added: string[]; removed: string[]; changed: string[] } {
  const norm = (r: RewardRule) =>
    JSON.stringify([r.key, [...r.equals].sort(), r.type, r.amount, r.priority ?? null, r.capCents ?? null, r.minSaleCents ?? null, r.maxSaleCents ?? null])
  const b = new Map(before.map((r) => [r.id, norm(r)]))
  const a = new Map(after.map((r) => [r.id, norm(r)]))
  return {
    added: [...a.keys()].filter((id) => !b.has(id)),
    removed: [...b.keys()].filter((id) => !a.has(id)),
    changed: [...a.keys()].filter((id) => b.has(id) && b.get(id) !== a.get(id)),
  }
}
