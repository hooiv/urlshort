/**
 * Auto-tag rules: a workspace-level list of "if the destination matches X, add
 * these tags" rules applied when a link is created. Pure matching logic; storage
 * and API layers call these helpers so behaviour stays testable without a DB.
 */
import { z } from 'zod'
import { MAX_TAGS_PER_LINK, normalizeTags } from '@/lib/bulk-edit'

export const MAX_AUTO_TAG_RULES = 50

export const autoTagRuleSchema = z.object({
  /** Host match: "example.com" matches example.com and any subdomain; "*.example.com" matches subdomains only. */
  host: z.string().trim().min(1).max(253).optional(),
  /** Case-insensitive substring that must appear in the destination path + query. */
  pathContains: z.string().trim().min(1).max(200).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).min(1).max(10),
}).refine((r) => r.host || r.pathContains, { message: 'A rule needs a host or a path fragment' })

export type AutoTagRule = z.infer<typeof autoTagRuleSchema>

export const autoTagRulesSchema = z.array(autoTagRuleSchema).max(MAX_AUTO_TAG_RULES)

function normalizeHost(raw: string): string {
  return raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '')
}

export function hostMatches(pattern: string, hostname: string): boolean {
  const p = normalizeHost(pattern)
  const h = hostname.toLowerCase().replace(/\.$/, '')
  if (!p) return false
  if (p.startsWith('*.')) return h.endsWith(p.slice(1)) && h.length > p.length - 1
  return h === p || h.endsWith(`.${p}`)
}

export function ruleMatches(rule: AutoTagRule, destination: string): boolean {
  let url: URL
  try {
    url = new URL(destination)
  } catch {
    return false
  }
  if (rule.host && !hostMatches(rule.host, url.hostname)) return false
  if (rule.pathContains) {
    const hay = `${url.pathname}${url.search}`.toLowerCase()
    if (!hay.includes(rule.pathContains.toLowerCase())) return false
  }
  return true
}

/** Tags the rules add for `destination`, merged with `existing` (normalized, deduped, capped). Rules never remove tags. */
export function applyAutoTagRules(rules: AutoTagRule[], destination: string, existing: string[] = []): { tags: string[]; added: string[] } {
  const base = normalizeTags(existing)
  const matched = rules.filter((r) => ruleMatches(r, destination)).flatMap((r) => r.tags)
  const merged = normalizeTags([...base, ...matched]).slice(0, MAX_TAGS_PER_LINK)
  const had = new Set(base)
  return { tags: merged, added: merged.filter((t) => !had.has(t)) }
}
