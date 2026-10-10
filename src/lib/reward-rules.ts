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
}

export type RewardDefault = { type: RewardType; amount: number }

export const MAX_PERCENT_BPS = 10_000

export function validateRule(rule: RewardRule): string | null {
  if (!rule.key.trim()) return 'key is required'
  if (rule.equals.length === 0) return 'equals needs at least one value'
  if (!Number.isInteger(rule.amount) || rule.amount < 0) return 'amount must be a non-negative integer'
  if (rule.type === 'percent' && rule.amount > MAX_PERCENT_BPS) return 'percent exceeds 10000 basis points'
  return null
}

export function matchRule(rules: RewardRule[], metadata: Record<string, unknown>): RewardRule | null {
  const sorted = rules
    .map((rule, index) => ({ rule, index }))
    .sort((a, b) => (a.rule.priority ?? 0) - (b.rule.priority ?? 0) || a.index - b.index)
  for (const { rule } of sorted) {
    if (validateRule(rule)) continue
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
  const rule = matchRule(rules, metadata)
  const spec = rule ?? fallback
  if (!spec) return { cents: 0, ruleId: null }
  const raw = spec.type === 'percent' ? Math.floor((saleValueCents * spec.amount) / MAX_PERCENT_BPS) : spec.amount
  return { cents: Math.min(raw, Math.floor(saleValueCents)), ruleId: rule ? rule.id : null }
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
    if (!matchRule(rules, metadata) && !fallback) continue
    const { cents, ruleId } = computeReward(saleValueCents, metadata, rules, fallback)
    return { cents, ruleId, scopeIndex: i }
  }
  return { cents: 0, ruleId: null, scopeIndex: null }
}
