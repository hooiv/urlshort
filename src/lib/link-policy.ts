import { z } from 'zod'

/**
 * Workspace link governance: rules every new or edited link must satisfy.
 * Pure evaluation so the same policy runs in the API, bulk edit and import.
 */
export const linkPolicySchema = z.object({
  requiredTags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(10).default([]),
  allowedDestinationHosts: z.array(z.string().trim().toLowerCase().min(1).max(253)).max(100).default([]),
  blockedDestinationHosts: z.array(z.string().trim().toLowerCase().min(1).max(253)).max(200).default([]),
  slugPrefix: z.string().trim().max(32).regex(/^[A-Za-z0-9_-]*$/).default(''),
  minSlugLength: z.number().int().min(1).max(64).default(1),
  requireHttps: z.boolean().default(false),
  requireExpiry: z.boolean().default(false),
  maxExpiryDays: z.number().int().min(1).max(3650).nullable().default(null),
})

export type LinkPolicy = z.infer<typeof linkPolicySchema>

export interface PolicyLinkInput {
  destination: string
  shortCode?: string | null
  tags?: string[]
  expiresAt?: Date | null
}

export interface PolicyViolation {
  rule: 'required_tags' | 'allowed_host' | 'blocked_host' | 'slug_prefix' | 'slug_length' | 'https' | 'expiry_required' | 'expiry_too_far' | 'invalid_url'
  message: string
}

/** True when `host` equals `rule` or is a subdomain of it. */
export function hostMatches(host: string, rule: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '')
  const r = rule.toLowerCase().replace(/^\*\./, '').replace(/\.$/, '')
  return h === r || h.endsWith(`.${r}`)
}

export function evaluateLinkPolicy(policy: LinkPolicy, link: PolicyLinkInput, now = new Date()): PolicyViolation[] {
  const out: PolicyViolation[] = []
  let url: URL | null = null
  try { url = new URL(link.destination) } catch { /* reported below */ }
  if (!url) {
    out.push({ rule: 'invalid_url', message: 'Destination is not a valid URL' })
  } else {
    if (policy.requireHttps && url.protocol !== 'https:') out.push({ rule: 'https', message: 'Destination must use https' })
    const host = url.hostname
    if (policy.blockedDestinationHosts.some((r) => hostMatches(host, r))) {
      out.push({ rule: 'blocked_host', message: `${host} is blocked by workspace policy` })
    }
    if (policy.allowedDestinationHosts.length && !policy.allowedDestinationHosts.some((r) => hostMatches(host, r))) {
      out.push({ rule: 'allowed_host', message: `${host} is not on the workspace's approved destination list` })
    }
  }
  const tags = new Set((link.tags ?? []).map((t) => t.trim().toLowerCase()))
  const missing = policy.requiredTags.filter((t) => !tags.has(t))
  if (missing.length) out.push({ rule: 'required_tags', message: `Missing required tag${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}` })
  if (link.shortCode) {
    if (policy.slugPrefix && !link.shortCode.startsWith(policy.slugPrefix)) {
      out.push({ rule: 'slug_prefix', message: `Short code must start with "${policy.slugPrefix}"` })
    }
    if (link.shortCode.length < policy.minSlugLength) {
      out.push({ rule: 'slug_length', message: `Short code must be at least ${policy.minSlugLength} characters` })
    }
  }
  if ((policy.requireExpiry || policy.maxExpiryDays) && !link.expiresAt) {
    if (policy.requireExpiry) out.push({ rule: 'expiry_required', message: 'Links must have an expiry date' })
  } else if (policy.maxExpiryDays && link.expiresAt) {
    const limit = now.getTime() + policy.maxExpiryDays * 86_400_000
    if (link.expiresAt.getTime() > limit) out.push({ rule: 'expiry_too_far', message: `Expiry must be within ${policy.maxExpiryDays} days` })
  }
  return out
}
