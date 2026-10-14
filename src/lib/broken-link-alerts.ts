import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'

/**
 * Daily owner email for links whose destination is confirmed down: at least
 * MIN_FAILURES consecutive failed probes, probed within the last 48h (so stale
 * statuses of paused probing never nag). Repeats daily until fixed or archived.
 */
export const BROKEN_ALERT_MIN_FAILURES = 3
export const BROKEN_ALERT_MAX_LINKS = 20
const DAY = 86_400_000

export type BrokenAlertLink = { shortCode: string; originalUrl: string; statusCode: number | null; failures: number; clicks: number }
export type BrokenOwnerAlerts = { email: string; name: string | null; total: number; links: BrokenAlertLink[] }

export function renderBrokenAlerts(o: BrokenOwnerAlerts, baseUrl: string): { subject: string; text: string } {
  const lines = o.links.map((l) =>
    `- /${l.shortCode} -> ${l.originalUrl.slice(0, 120)} (${l.statusCode ? `HTTP ${l.statusCode}` : 'unreachable'}, ${l.failures} failed checks in a row, ${l.clicks} clicks)`)
  const more = o.total > o.links.length ? `\n...and ${o.total - o.links.length} more.` : ''
  const n = o.total
  return {
    subject: `${n} short link${n === 1 ? ' points' : 's point'} to a broken destination`,
    text: `${o.name ? `Hi ${o.name},\n\n` : ''}These links keep failing health checks, so visitors are likely hitting errors:\n\n${lines.join('\n')}${more}\n\nFix the destination or archive them: ${baseUrl}/manage/broken\n`,
  }
}

export async function collectBrokenAlerts(now: Date = new Date()): Promise<BrokenOwnerAlerts[]> {
  const rows = await prisma.url.findMany({
    where: {
      isActive: true, deletedAt: null, healthStatus: 'down',
      healthConsecutiveFailures: { gte: BROKEN_ALERT_MIN_FAILURES },
      healthCheckedAt: { gte: new Date(now.getTime() - 2 * DAY) },
      user: { is: { email: { not: '' } } },
    },
    select: { shortCode: true, originalUrl: true, healthStatusCode: true, healthConsecutiveFailures: true, clicks: true, user: { select: { email: true, name: true } } },
    orderBy: [{ clicks: 'desc' }, { shortCode: 'asc' }],
    take: 5000,
  })
  const by = new Map<string, BrokenOwnerAlerts>()
  for (const r of rows) {
    if (!r.user) continue
    const o = by.get(r.user.email) ?? { email: r.user.email, name: r.user.name, total: 0, links: [] }
    o.total++
    if (o.links.length < BROKEN_ALERT_MAX_LINKS) o.links.push({ shortCode: r.shortCode, originalUrl: r.originalUrl, statusCode: r.healthStatusCode, failures: r.healthConsecutiveFailures, clicks: r.clicks })
    by.set(r.user.email, o)
  }
  return [...by.values()]
}

export async function sendBrokenAlerts(baseUrl: string, now: Date = new Date()): Promise<{ owners: number; links: number; failed: number }> {
  const owners = await collectBrokenAlerts(now)
  let links = 0
  let failed = 0
  for (const o of owners) {
    const { subject, text } = renderBrokenAlerts(o, baseUrl)
    if (await sendEmail({ to: o.email, subject, text })) links += o.total
    else failed++
  }
  return { owners: owners.length, links, failed }
}
