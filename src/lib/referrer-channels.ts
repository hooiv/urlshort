import { Prisma } from '@prisma/client'
import { prisma } from './prisma'

/**
 * Per-link traffic channels: human clicks grouped by the referrer host and
 * classified into Search / Social / Email / Messaging / Other / Direct.
 * Grouping runs in Postgres on (urlId, createdAt); classification is pure.
 */

export const CHANNELS = ['qr', 'search', 'social', 'email', 'messaging', 'other', 'direct'] as const
export type Channel = (typeof CHANNELS)[number]
export const CHANNEL_MAX_DAYS = 365
export const CHANNEL_DEFAULT_DAYS = 30
const DAY_MS = 86_400_000

const SEARCH = ['google', 'bing', 'duckduckgo', 'yahoo', 'baidu', 'yandex', 'ecosia', 'brave', 'startpage', 'kagi', 'perplexity', 'naver', 'qwant']
const SOCIAL = ['facebook', 'instagram', 'twitter', 'x.com', 't.co', 'linkedin', 'lnkd.in', 'reddit', 'pinterest', 'tiktok', 'youtube', 'youtu.be', 'threads', 'bsky', 'bluesky', 'tumblr', 'snapchat', 'mastodon', 'fb.com', 'fb.me', 'vk.com', 'weibo']
const EMAIL = ['mail.google', 'outlook', 'mail.yahoo', 'mail.proton', 'proton.me', 'substack', 'mailchimp', 'campaign-archive', 'beehiiv', 'convertkit', 'mail.']
const MESSAGING = ['whatsapp', 'wa.me', 'telegram', 't.me', 'slack', 'discord', 'signal', 'messenger', 'line.me', 'teams.microsoft']

/** True if host equals a label or contains it at a dot boundary (e.g. "l.facebook.com" ~ "facebook"). */
function matches(host: string, needles: string[]): boolean {
  const labels = host.split('.')
  return needles.some((n) => {
    if (n.includes('.')) return host === n || host.endsWith(`.${n}`) || host.startsWith(n)
    return labels.includes(n)
  })
}

export function classifyReferrer(host: string | null | undefined): Channel {
  const h = (host ?? '').trim().toLowerCase().replace(/^www\./, '').replace(/\.$/, '')
  if (!h) return 'direct'
  if (matches(h, EMAIL)) return 'email'
  if (matches(h, MESSAGING)) return 'messaging'
  if (matches(h, SEARCH)) return 'search'
  if (matches(h, SOCIAL)) return 'social'
  return 'other'
}

/** A click whose utm_medium is "qr" came from a scanned code regardless of referrer (scanners send none). */
export function isQrMedium(medium: string | null | undefined): boolean {
  return (medium ?? '').trim().toLowerCase() === 'qr'
}

export function parseChannelDays(raw: string | null): number | null {
  if (raw === null || raw === '') return CHANNEL_DEFAULT_DAYS
  if (!/^\d{1,4}$/.test(raw)) return null
  const n = Number(raw)
  return n >= 1 && n <= CHANNEL_MAX_DAYS ? n : null
}

export type ChannelRow = { channel: Channel; clicks: number; share: number; topHosts: Array<{ host: string; clicks: number }> }
export type ChannelBreakdown = { days: number; total: number; channels: ChannelRow[] }

/** Pure: classify host counts, aggregate per channel, keep top 3 hosts each, order by clicks. */
export function buildChannelBreakdown(raw: Array<{ host: string | null; clicks: number; qr?: boolean }>, days: number): ChannelBreakdown {
  const byChannel = new Map<Channel, Map<string, number>>()
  for (const { host, clicks, qr } of raw) {
    if (!Number.isFinite(clicks) || clicks <= 0) continue
    const clean = (host ?? '').trim().toLowerCase().replace(/^www\./, '')
    const ch: Channel = qr ? 'qr' : classifyReferrer(clean)
    const hosts = byChannel.get(ch) ?? new Map<string, number>()
    const key = clean || '(direct)'
    hosts.set(key, (hosts.get(key) ?? 0) + clicks)
    byChannel.set(ch, hosts)
  }
  let total = 0
  const rows: ChannelRow[] = []
  for (const [channel, hosts] of byChannel) {
    const sum = [...hosts.values()].reduce((a, b) => a + b, 0)
    total += sum
    const topHosts = [...hosts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([host, clicks]) => ({ host, clicks }))
    rows.push({ channel, clicks: sum, share: 0, topHosts })
  }
  for (const r of rows) r.share = total ? Math.round((r.clicks / total) * 1000) / 10 : 0
  rows.sort((a, b) => b.clicks - a.clicks || CHANNELS.indexOf(a.channel) - CHANNELS.indexOf(b.channel))
  return { days, total, channels: rows }
}

export async function getChannelBreakdown(urlId: string, days: number, now = new Date()): Promise<ChannelBreakdown> {
  const since = new Date(now.getTime() - days * DAY_MS)
  const rows = await prisma.$queryRaw<Array<{ host: string | null; qr: boolean; clicks: bigint }>>(Prisma.sql`
    SELECT "referrerHost" AS host, (lower(btrim(COALESCE("utmMedium", ''))) = 'qr') AS qr, COUNT(*) AS clicks
    FROM "click_events"
    WHERE "urlId" = ${urlId} AND "createdAt" >= ${since} AND "createdAt" <= ${now} AND "trafficType" = 'human'
    GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 500`)
  return buildChannelBreakdown(rows.map((r) => ({ host: r.host, qr: r.qr, clicks: Number(r.clicks) })), days)
}
