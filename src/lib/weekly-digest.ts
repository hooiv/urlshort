import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { getAggregatedAnalytics, type AnalyticsWindow } from '@/lib/aggregate-analytics'

/**
 * Opt-in weekly performance email: last 7 complete UTC days vs the 7 before,
 * top links, top country/referrer, and revenue. Sends are claimed atomically
 * (compare-and-set on weeklyDigestSentAt) so overlapping cron runs or retries
 * never email a user twice in the same week.
 */
const DAY = 86_400_000
export const MIN_INTERVAL_MS = 6 * DAY + 12 * 3_600_000
const key = (d: Date) => d.toISOString().slice(0, 10)

export function digestWindow(now: Date): AnalyticsWindow {
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - DAY)
  const from = new Date(to.getTime() - 6 * DAY)
  return { from: key(from), to: key(to), days: 7 }
}

type Analytics = Awaited<ReturnType<typeof getAggregatedAnalytics>>

export function formatChange(pct: number | null): string {
  if (pct === null) return 'new'
  if (pct === 0) return 'flat'
  return `${pct > 0 ? '+' : ''}${Math.round(pct)}%`
}

export function money(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`
  }
}

export function hasActivity(a: Analytics): boolean {
  return a.totals.clicks > 0 || a.previous.clicks > 0 || a.totals.conversions > 0
}

export function renderWeeklyDigest(a: Analytics, user: { name: string | null }, baseUrl: string): { subject: string; text: string } {
  const lines: string[] = []
  if (user.name) lines.push(`Hi ${user.name},`, '')
  lines.push(`Your links, ${a.window.from} to ${a.window.to}:`, '')
  lines.push(`Clicks: ${a.totals.clicks.toLocaleString('en-US')} (${formatChange(a.change.clicks)} vs previous week)`)
  if (a.totals.conversions || a.previous.conversions) lines.push(`Conversions: ${a.totals.conversions.toLocaleString('en-US')} (${formatChange(a.change.conversions)})`)
  for (const r of a.revenueByCurrency.slice(0, 3)) lines.push(`Revenue: ${money(r.valueCents, r.currency)}`)
  if (a.topLinks.length) {
    lines.push('', 'Top links:')
    a.topLinks.slice(0, 5).forEach((l, i) => lines.push(`${i + 1}. ${baseUrl}/${l.shortCode} — ${l.clicks.toLocaleString('en-US')} clicks${l.title ? ` (${l.title})` : ''}`))
  }
  const c = a.breakdowns.countries[0]
  const r = a.breakdowns.referrers[0]
  if (c || r) {
    lines.push('')
    if (c) lines.push(`Top country: ${c.key} (${c.clicks.toLocaleString('en-US')})`)
    if (r) lines.push(`Top referrer: ${r.key} (${r.clicks.toLocaleString('en-US')})`)
  }
  lines.push('', `Full analytics: ${baseUrl}/analytics`, `Stop these emails: ${baseUrl}/account/notifications`, '')
  const delta = a.change.clicks
  const subject = `${a.totals.clicks.toLocaleString('en-US')} clicks last week${delta === null ? '' : ` (${formatChange(delta)})`}`
  return { subject, text: lines.join('\n') }
}

export async function sendWeeklyDigests(baseUrl: string, now: Date = new Date(), limit = 200): Promise<{ sent: number; skipped: number; failed: number }> {
  const cutoff = new Date(now.getTime() - MIN_INTERVAL_MS)
  const users = await prisma.user.findMany({
    where: { weeklyDigest: true, emailVerifiedAt: { not: null }, OR: [{ weeklyDigestSentAt: null }, { weeklyDigestSentAt: { lt: cutoff } }] },
    select: { id: true, email: true, name: true, weeklyDigestSentAt: true },
    orderBy: { id: 'asc' },
    take: limit,
  })
  const window = digestWindow(now)
  let sent = 0, skipped = 0, failed = 0
  for (const user of users) {
    const claim = await prisma.user.updateMany({
      where: { id: user.id, weeklyDigest: true, OR: [{ weeklyDigestSentAt: null }, { weeklyDigestSentAt: { lt: cutoff } }] },
      data: { weeklyDigestSentAt: now },
    })
    if (claim.count !== 1) { skipped++; continue }
    try {
      const analytics = await getAggregatedAnalytics({ kind: 'user', userId: user.id }, window)
      if (!hasActivity(analytics)) { skipped++; continue }
      const { subject, text } = renderWeeklyDigest(analytics, user, baseUrl)
      if (await sendEmail({ to: user.email, subject, text })) sent++
      else throw new Error('delivery failed')
    } catch (error) {
      failed++
      console.error('weekly digest failed for user', user.id, error)
      // Release the claim so the next run retries.
      await prisma.user.updateMany({ where: { id: user.id, weeklyDigestSentAt: now }, data: { weeklyDigestSentAt: user.weeklyDigestSentAt } })
    }
  }
  return { sent, skipped, failed }
}
