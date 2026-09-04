import { formatNumber } from '@/lib/format'
import type { Anomaly, Campaign, CampaignAction, Decision, LinkOption, Variant } from './types'

export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}$/

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug.trim())
}

export function isValidHttpUrl(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed || /\s/.test(trimmed)) return false
  try {
    const parsed = new URL(trimmed)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export type CampaignFormInput = {
  name: string
  slug: string
  primaryUrlId: string
  objective: string
  autoOptimize: boolean
  controlName: string
  variantName: string
  controlUrl: string
  variantUrl: string
}

/** Client-side validation mirroring the POST /api/campaigns zod schema. Returns an error message or null. */
export function validateCampaignForm(input: CampaignFormInput): string | null {
  const name = input.name.trim()
  if (!name) return 'Give the campaign a name'
  if (name.length > 160) return 'Campaign name must be 160 characters or fewer'
  const slug = input.slug.trim()
  if (!slug) return 'Give the campaign a slug'
  if (!SLUG_PATTERN.test(slug)) return 'Slug must be lowercase letters, numbers, and hyphens (e.g. spring-launch)'
  if (!input.primaryUrlId) return 'Select the permanent short link that will receive traffic'
  const controlName = input.controlName.trim()
  const variantName = input.variantName.trim()
  if (!controlName) return 'Name the control variant'
  if (!variantName) return 'Name variant B'
  if (controlName.length > 120 || variantName.length > 120) return 'Variant names must be 120 characters or fewer'
  if (!input.controlUrl.trim() || !isValidHttpUrl(input.controlUrl)) return 'Control destination must be a valid http(s) URL'
  if (!input.variantUrl.trim() || !isValidHttpUrl(input.variantUrl)) return 'Variant B destination must be a valid http(s) URL'
  if (input.controlUrl.trim().length > 4096 || input.variantUrl.trim().length > 4096)
    return 'Destination URLs must be 4096 characters or fewer'
  return null
}

export function buildCreatePayload(input: CampaignFormInput) {
  return {
    name: input.name.trim(),
    slug: input.slug.trim(),
    primaryUrlId: input.primaryUrlId,
    objective: input.objective,
    autoOptimize: input.autoOptimize,
    variants: [
      { name: input.controlName.trim(), destinationUrl: input.controlUrl.trim(), isControl: true, weight: 50 },
      { name: input.variantName.trim(), destinationUrl: input.variantUrl.trim(), isControl: false, weight: 50 },
    ],
  }
}

export function emptyVariant(name: string, destinationUrl: string, isControl = false) {
  return { name, destinationUrl, isControl, weight: 50 }
}

export function calculateTotals(variants: Variant[] | undefined | null): {
  totalClicks: number
  totalConversions: number
  cvr: number
} {
  const list = variants ?? []
  const totalClicks = list.reduce((sum, variant) => sum + (Number(variant.clicks) || 0), 0)
  const totalConversions = list.reduce((sum, variant) => sum + (Number(variant.conversions) || 0), 0)
  return { totalClicks, totalConversions, cvr: totalClicks ? totalConversions / totalClicks : 0 }
}

/** Share of traffic observed for a variant; falls back to configured weight before data exists. */
export function variantAllocation(variant: Variant, totalClicks: number): number {
  if (totalClicks > 0) return (Number(variant.clicks) || 0) / totalClicks
  return (Number(variant.weight) || 0) / 100
}

export function clampPercent(fraction: number): number {
  if (!Number.isFinite(fraction)) return 0
  return Math.min(100, Math.max(0, fraction * 100))
}

/** The list endpoint omits decisions/anomalies/links — tolerate undefined so cards never crash. */
export function getActiveAnomalies(anomalies: Anomaly[] | undefined | null): Anomaly[] {
  return (anomalies ?? []).filter((anomaly) => !anomaly.resolvedAt)
}

export function getLatestDecision(decisions: Decision[] | undefined | null): Decision | null {
  const list = decisions ?? []
  return list.length > 0 ? list[0] : null
}

export function getLiveLink(links: Campaign['links'] | undefined | null): LinkOption | null {
  return links?.[0]?.url ?? null
}

export function formatCvr(cvr: number): string {
  if (!Number.isFinite(cvr)) return '0.00%'
  return `${(cvr * 100).toFixed(2)}%`
}

export function formatEvidenceFloor(minSampleSize: number, minConversions: number): string {
  return `${formatNumber(minSampleSize)} / ${formatNumber(minConversions)} conv`
}

/**
 * Money formatting that honors the campaign currency instead of hardcoding USD,
 * and never renders $NaN for malformed valueCents.
 */
export function formatMoney(valueCents: string | number | null | undefined, currency: string | null | undefined): string {
  const parsed = typeof valueCents === 'string' ? Number(valueCents) : (valueCents ?? 0)
  const safeCents = Number.isFinite(parsed) ? (parsed as number) : 0
  const code = (currency ?? 'USD').toUpperCase() || 'USD'
  try {
    return (safeCents / 100).toLocaleString(undefined, { style: 'currency', currency: code })
  } catch {
    return (safeCents / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' })
  }
}

/** Omit the workspaceId query param when empty so bulk scoping falls back to the default workspace. */
export function buildBulkUrl(workspaceId: string | null | undefined): string {
  const trimmed = (workspaceId ?? '').trim()
  if (!trimmed) return '/api/campaigns/bulk'
  return `/api/campaigns/bulk?workspaceId=${encodeURIComponent(trimmed)}`
}

export function readWorkspaceIdFromSearch(search: string): string {
  try {
    return new URLSearchParams(search).get('workspaceId') ?? ''
  } catch {
    return ''
  }
}

/** Keep the exact API call shape for start/autopilot/pause in one testable place. */
export function campaignActionRequest(
  id: string,
  action: CampaignAction
): { url: string; method: string; headers?: Record<string, string>; body?: string } {
  if (action === 'pause') {
    return {
      url: `/api/campaigns/${id}`,
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'paused' }),
    }
  }
  if (action === 'autopilot') return { url: `/api/campaigns/${id}?action=autopilot`, method: 'POST' }
  return { url: `/api/campaigns/${id}?action=start`, method: 'POST' }
}

/** Keep a valid entry-link selection when the link list refreshes (e.g. a link was deleted). */
export function resolvePrimaryUrlId(current: string, links: LinkOption[]): string {
  if (current && links.some((link) => link.id === current)) return current
  return links[0]?.id ?? ''
}

export function newIdempotencyKey(): string {
  try {
    const candidate = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
    if (candidate?.randomUUID) return candidate.randomUUID()
  } catch {
    // fall through to the Math.random fallback below
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}
