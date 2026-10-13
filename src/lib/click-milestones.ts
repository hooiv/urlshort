import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'

/**
 * Click milestone alerts: owners who opted in get one email when a link first
 * reaches 100, 1k, 10k, 100k or 1M clicks. De-duplication is a compare-and-set
 * on Url.milestoneReached, so overlapping cron runs never double-send, and a
 * failed send rolls the marker back so the next run retries.
 */
export const CLICK_MILESTONES = [100, 1_000, 10_000, 100_000, 1_000_000] as const

/** Highest milestone <= clicks that is above `reached`, or null. */
export function crossedMilestone(clicks: number, reached: number): number | null {
  let hit: number | null = null
  for (const m of CLICK_MILESTONES) if (clicks >= m && m > reached) hit = m
  return hit
}

export function formatMilestone(m: number): string {
  if (m >= 1_000_000) return `${m / 1_000_000}M`
  if (m >= 1000) return `${m / 1000}k`
  return String(m)
}

export type MilestoneHit = { shortCode: string; originalUrl: string; milestone: number; clicks: number }

export function renderMilestoneEmail(name: string | null, hits: MilestoneHit[], baseUrl: string): { subject: string; text: string } {
  const sorted = [...hits].sort((a, b) => b.milestone - a.milestone || a.shortCode.localeCompare(b.shortCode))
  const subject = sorted.length === 1 ? `${baseUrl.replace(/^https?:\/\//, '')}/${sorted[0].shortCode} reached ${formatMilestone(sorted[0].milestone)} clicks` : `${sorted.length} of your links hit a click milestone`
  const lines = sorted.map((h) => `- ${baseUrl}/${h.shortCode} passed ${formatMilestone(h.milestone)} clicks (${h.clicks.toLocaleString('en-US')} now) -> ${h.originalUrl}`)
  return { subject, text: `${name ? `Hi ${name},\n\n` : ''}Nice work:\n\n${lines.join('\n')}\n\nSee the breakdown: ${baseUrl}/manage/trending\nTurn these alerts off: ${baseUrl}/account/notifications\n` }
}

export async function sendMilestoneAlerts(baseUrl: string): Promise<{ owners: number; links: number; failed: number }> {
  const rows = await prisma.url.findMany({
    where: { deletedAt: null, userId: { not: null }, clicks: { gte: CLICK_MILESTONES[0] }, user: { milestoneAlerts: true, emailVerifiedAt: { not: null } } },
    select: { id: true, shortCode: true, originalUrl: true, clicks: true, milestoneReached: true, user: { select: { id: true, email: true, name: true } } },
    take: 5000,
  })
  const byOwner = new Map<string, { email: string; name: string | null; claimed: (MilestoneHit & { id: string; previous: number })[] }>()
  for (const r of rows) {
    if (!r.user) continue
    const m = crossedMilestone(r.clicks, r.milestoneReached)
    if (m === null) continue
    const claim = await prisma.url.updateMany({ where: { id: r.id, milestoneReached: { lt: m } }, data: { milestoneReached: m } })
    if (claim.count === 0) continue
    const o = byOwner.get(r.user.id) ?? { email: r.user.email, name: r.user.name, claimed: [] }
    o.claimed.push({ id: r.id, shortCode: r.shortCode, originalUrl: r.originalUrl, milestone: m, clicks: r.clicks, previous: r.milestoneReached })
    byOwner.set(r.user.id, o)
  }
  let links = 0
  let failed = 0
  for (const o of byOwner.values()) {
    const { subject, text } = renderMilestoneEmail(o.name, o.claimed, baseUrl)
    const ok = await sendEmail({ to: o.email, subject, text })
    if (ok) links += o.claimed.length
    else {
      failed++
      for (const c of o.claimed) await prisma.url.updateMany({ where: { id: c.id, milestoneReached: c.milestone }, data: { milestoneReached: c.previous } })
    }
  }
  return { owners: byOwner.size, links, failed }
}
