import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { LINK_READ_SCOPES, resolveActor } from '@/lib/request-actor'
import {
  findShadowedRules,
  parseDefault,
  parseRules,
  simulateRewards,
  type RewardScope,
} from '@/lib/reward-rules'

const MAX_SAMPLES = 100
const MAX_SCOPES = 3

/**
 * POST /api/rewards/preview
 * Stateless dry run: { scopes: [{ rules, fallback }] (most specific first),
 * samples: [{ saleValueCents, metadata }] } -> payout per sample plus
 * shadowed (unreachable) rules per scope. Nothing is stored.
 */
export async function POST(request: NextRequest) {
  const limit = await rateLimit(request, { name: 'rewards-preview', limit: 60, windowMs: 60_000 })
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(limit) })

  const resolved = await resolveActor(request, LINK_READ_SCOPES)
  if (!resolved.actor) {
    return NextResponse.json({ error: resolved.error === 'Authentication required' ? 'Unauthorized' : resolved.error }, { status: resolved.status })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const input = body as { scopes?: unknown; samples?: unknown } | null
  if (!input || !Array.isArray(input.scopes) || input.scopes.length === 0 || input.scopes.length > MAX_SCOPES) {
    return NextResponse.json({ error: `scopes must be an array of 1-${MAX_SCOPES}` }, { status: 400 })
  }
  if (!Array.isArray(input.samples) || input.samples.length === 0 || input.samples.length > MAX_SAMPLES) {
    return NextResponse.json({ error: `samples must be an array of 1-${MAX_SAMPLES}` }, { status: 400 })
  }

  const scopes: RewardScope[] = []
  const shadowed: { scopeIndex: number; ruleId: string; shadowedBy: string }[] = []
  for (let i = 0; i < input.scopes.length; i++) {
    const raw = (input.scopes[i] ?? {}) as { rules?: unknown; fallback?: unknown }
    const rules = parseRules(raw.rules ?? [])
    if ('error' in rules) return NextResponse.json({ error: `scopes[${i}].rules: ${rules.error}` }, { status: 400 })
    const fallback = raw.fallback == null ? { fallback: null } : parseDefault(raw.fallback)
    if ('error' in fallback) return NextResponse.json({ error: `scopes[${i}].fallback: ${fallback.error}` }, { status: 400 })
    scopes.push({ rules: rules.rules, fallback: fallback.fallback })
    for (const s of findShadowedRules(rules.rules)) shadowed.push({ scopeIndex: i, ...s })
  }

  const samples: { saleValueCents: number; metadata: Record<string, unknown> }[] = []
  for (let i = 0; i < input.samples.length; i++) {
    const s = input.samples[i] as { saleValueCents?: unknown; metadata?: unknown } | null
    if (!s || typeof s.saleValueCents !== 'number' || !Number.isFinite(s.saleValueCents) || s.saleValueCents < 0) {
      return NextResponse.json({ error: `samples[${i}].saleValueCents must be a non-negative number` }, { status: 400 })
    }
    const metadata = s.metadata && typeof s.metadata === 'object' && !Array.isArray(s.metadata) ? (s.metadata as Record<string, unknown>) : {}
    samples.push({ saleValueCents: s.saleValueCents, metadata })
  }

  return NextResponse.json({ results: simulateRewards(samples, scopes), shadowed }, { headers: rateLimitHeaders(limit) })
}
