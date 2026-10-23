import { getReferrerPerformance, type ReferrerStat } from './referrer-performance'

/**
 * Referrer spam detection. Classified-human clicks that carry a fake referrer inflate the referrer report;
 * this flags hosts by two independent signals so the owner can see why:
 *  - "known-spam": host (or a parent domain) is on a curated list of notorious referrer-spam networks.
 *  - "single-source": plenty of clicks from very few distinct visitors (one machine replaying requests).
 *  - "burst": the host had no clicks in the previous window and now makes up a dominant share of traffic.
 */
export const KNOWN_SPAM_DOMAINS = [
  'semalt.com', 'buttons-for-website.com', 'darodar.com', 'econom.co', 'kambasoft.com', 'savetubevideo.com',
  'best-seo-offer.com', 'floating-share-buttons.com', 'free-share-buttons.com', 'get-free-traffic-now.com',
  'hulfingtonpost.com', 'ilovevitaly.com', 'blackhatworth.com', 'o00.in', 'cenokos.ru', 'event-tracking.com',
  'traffic2money.com', 'webmonetizer.net', 'trafficmonetize.org', 'trafficmonetizer.org',
] as const

export const SPAM_MIN_CLICKS = 20
export const SPAM_SINGLE_SOURCE_MAX_VISITOR_RATIO = 0.1
export const SPAM_BURST_MIN_SHARE_PCT = 40

export type SpamSignal = 'known-spam' | 'single-source' | 'burst'
export type SpamFlag = { host: string; clicks: number; visitors: number; sharePct: number; signals: SpamSignal[] }

export function isKnownSpamHost(host: string): boolean {
  return KNOWN_SPAM_DOMAINS.some((d) => host === d || host.endsWith('.' + d))
}

export function detectReferrerSpam(stats: ReferrerStat[]): SpamFlag[] {
  const flags: SpamFlag[] = []
  for (const s of stats) {
    const signals: SpamSignal[] = []
    if (isKnownSpamHost(s.host)) signals.push('known-spam')
    if (s.clicks >= SPAM_MIN_CLICKS && s.visitors / s.clicks <= SPAM_SINGLE_SOURCE_MAX_VISITOR_RATIO) signals.push('single-source')
    if (s.clicks >= SPAM_MIN_CLICKS && s.previousClicks === 0 && s.sharePct >= SPAM_BURST_MIN_SHARE_PCT) signals.push('burst')
    if (signals.length) flags.push({ host: s.host, clicks: s.clicks, visitors: s.visitors, sharePct: s.sharePct, signals })
  }
  return flags.sort((a, b) => b.signals.length - a.signals.length || b.clicks - a.clicks || a.host.localeCompare(b.host))
}

export async function getReferrerSpamReport(
  workspaceId: string,
  viewer: { userId: string } | undefined,
  days: number,
  now = new Date(),
) {
  const perf = await getReferrerPerformance(workspaceId, viewer, days, now)
  const flagged = detectReferrerSpam(perf.referrers)
  const spamClicks = flagged.reduce((s, f) => s + f.clicks, 0)
  const total = perf.referrers.reduce((s, r) => s + r.clicks, 0)
  return {
    days, from: perf.from, to: perf.to, flagged,
    spamClicks, totalReferredClicks: total,
    spamSharePct: total > 0 ? Math.round((spamClicks / total) * 1000) / 10 : 0,
  }
}
