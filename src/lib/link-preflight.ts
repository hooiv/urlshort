import { prisma } from '@/lib/prisma'
import { assessDestination } from '@/lib/link-safety'
import { normalizeDestination } from '@/lib/duplicate-links'
import { probeDestination, type HealthProbe } from '@/lib/destination-health'
import type { AnalyticsScope } from '@/lib/aggregate-analytics'

export type PreflightSeverity = 'error' | 'warning' | 'info'
export type PreflightIssue = { code: string; severity: PreflightSeverity; message: string }
export type PreflightDuplicate = { shortCode: string; title: string | null }
export type PreflightResult = {
  ok: boolean
  destination: string | null
  issues: PreflightIssue[]
  probe: HealthProbe | null
  duplicates: PreflightDuplicate[]
}

const TRACKING_PARAM = /^(fbclid|gclid|msclkid|ttclid|li_fat_id|mc_cid|mc_eid|igshid|ref_src)$/i
const MAX_DUPLICATES = 5
const MAX_URL_LENGTH = 2048

export type PreflightDeps = {
  probe: (url: string) => Promise<HealthProbe>
  findDuplicates: (normalized: string) => Promise<PreflightDuplicate[]>
}

/** Pure static checks that need no network: shape, scheme, length, tracking params, risk heuristics. */
export function staticIssues(raw: string): { url: URL | null; issues: PreflightIssue[] } {
  const issues: PreflightIssue[] = []
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return { url: null, issues: [{ code: 'empty', severity: 'error', message: 'Enter a destination URL.' }] }
  if (trimmed.length > MAX_URL_LENGTH) {
    return { url: null, issues: [{ code: 'too_long', severity: 'error', message: `URL is longer than ${MAX_URL_LENGTH} characters.` }] }
  }
  let url: URL
  try { url = new URL(trimmed) } catch {
    return { url: null, issues: [{ code: 'invalid', severity: 'error', message: 'Not a valid URL. Include the scheme, e.g. https://.' }] }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { url, issues: [{ code: 'scheme', severity: 'error', message: `Only http and https destinations are supported, not ${url.protocol}` }] }
  }
  if (url.username || url.password) {
    issues.push({ code: 'credentials', severity: 'error', message: 'URLs with embedded credentials are not allowed.' })
  }
  if (url.protocol === 'http:') {
    issues.push({ code: 'insecure', severity: 'warning', message: 'Destination uses http; visitors may see browser warnings. Prefer https.' })
  }
  const trackers = [...url.searchParams.keys()].filter((k) => TRACKING_PARAM.test(k))
  if (trackers.length) {
    issues.push({ code: 'click_ids', severity: 'warning', message: `Contains one-off click identifiers (${trackers.join(', ')}) that will be reused for every visitor.` })
  }
  const risk = assessDestination(url.toString())
  if (risk.status === 'review') issues.push({ code: 'risk_review', severity: 'warning', message: risk.reason ?? 'This destination looks risky and will be held for review.' })
  return { url, issues }
}

export function probeIssues(probe: HealthProbe): PreflightIssue[] {
  if (probe.status === 'down') {
    return [{ code: 'unreachable', severity: 'error', message: probe.error ? `Destination is unreachable: ${probe.error}` : `Destination returned HTTP ${probe.statusCode ?? 'error'}.` }]
  }
  const issues: PreflightIssue[] = []
  if (probe.status === 'degraded') issues.push({ code: 'degraded', severity: 'warning', message: `Destination responded with HTTP ${probe.statusCode ?? 'unknown'}.` })
  if (probe.latencyMs !== null && probe.latencyMs > 2500) issues.push({ code: 'slow', severity: 'warning', message: `Destination took ${probe.latencyMs} ms to respond.` })
  return issues
}

export async function runPreflight(raw: string, deps: PreflightDeps): Promise<PreflightResult> {
  const { url, issues } = staticIssues(raw)
  const blocked = issues.some((i) => i.severity === 'error')
  if (!url || blocked) return { ok: false, destination: url?.toString() ?? null, issues, probe: null, duplicates: [] }

  const normalized = normalizeDestination(url.toString())
  const [probeSettled, dupSettled] = await Promise.allSettled([
    deps.probe(url.toString()),
    normalized ? deps.findDuplicates(normalized) : Promise.resolve([] as PreflightDuplicate[]),
  ])
  let probe: HealthProbe | null = null
  if (probeSettled.status === 'fulfilled') {
    probe = probeSettled.value
    issues.push(...probeIssues(probe))
    if (probe.finalUrl && probe.finalUrl !== url.toString()) {
      try {
        if (new URL(probe.finalUrl).host !== url.host) issues.push({ code: 'redirects', severity: 'info', message: `Destination redirects to ${new URL(probe.finalUrl).host}.` })
      } catch { /* ignore malformed final URL */ }
    }
  } else {
    issues.push({ code: 'probe_failed', severity: 'warning', message: 'Could not check the destination right now.' })
  }
  const duplicates = dupSettled.status === 'fulfilled' ? dupSettled.value.slice(0, MAX_DUPLICATES) : []
  if (duplicates.length) {
    issues.push({ code: 'duplicate', severity: 'info', message: `You already have ${duplicates.length === 1 ? 'a link' : 'links'} to this destination: ${duplicates.map((d) => d.shortCode).join(', ')}.` })
  }
  return { ok: !issues.some((i) => i.severity === 'error'), destination: url.toString(), issues, probe, duplicates }
}

export function prismaDeps(scope: AnalyticsScope): PreflightDeps {
  return {
    probe: probeDestination,
    async findDuplicates(normalized) {
      const host = normalized.split(/[/?]/)[0]
      const where = scope.kind === 'workspace'
        ? { workspaceId: scope.workspaceId, ...(scope.viewer ? { userId: scope.viewer.userId } : {}) }
        : { userId: scope.userId }
      const candidates = await prisma.url.findMany({
        where: { ...where, isActive: true, deletedAt: null, originalUrl: { contains: host.replace(/^www\./, ''), mode: 'insensitive' } },
        select: { shortCode: true, title: true, originalUrl: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      })
      return candidates.filter((c) => normalizeDestination(c.originalUrl) === normalized).map((c) => ({ shortCode: c.shortCode, title: c.title }))
    },
  }
}
