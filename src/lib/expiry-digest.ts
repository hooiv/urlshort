import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'

/**
 * Daily owner digest of links about to expire. Stateless de-duplication: a run
 * covers one 24h window per threshold (7 days and 1 day ahead), so a link is
 * mentioned once per threshold when the cron runs once a day.
 */
export const DIGEST_THRESHOLD_DAYS = [7, 1] as const
const DAY = 86_400_000

export type DigestLink = { shortCode: string; originalUrl: string; expiresAt: Date; thresholdDays: number }
export type OwnerDigest = { email: string; name: string | null; links: DigestLink[] }

export function windowFor(now: Date, thresholdDays: number): { gt: Date; lte: Date } {
  return { gt: new Date(now.getTime() + (thresholdDays - 1) * DAY), lte: new Date(now.getTime() + thresholdDays * DAY) }
}

export function thresholdFor(expiresAt: Date, now: Date): number | null {
  for (const t of DIGEST_THRESHOLD_DAYS) {
    const w = windowFor(now, t)
    if (expiresAt > w.gt && expiresAt <= w.lte) return t
  }
  return null
}

export function renderDigest(d: OwnerDigest, baseUrl: string): { subject: string; text: string } {
  const sorted = [...d.links].sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime())
  const n = sorted.length
  const lines = sorted.map(
    (l) => `- ${baseUrl}/${l.shortCode} expires ${l.expiresAt.toISOString().slice(0, 16).replace('T', ' ')} UTC (${l.thresholdDays === 1 ? 'within a day' : 'in about a week'}) -> ${l.originalUrl}`
  )
  return {
    subject: `${n} short link${n === 1 ? '' : 's'} expiring soon`,
    text: `${d.name ? `Hi ${d.name},\n\n` : ''}These links will stop redirecting soon and visitors will see your fallback page:\n\n${lines.join('\n')}\n\nExtend or renew them: ${baseUrl}/manage/expiring\n`,
  }
}

export async function collectDigests(now: Date = new Date()): Promise<OwnerDigest[]> {
  const or = DIGEST_THRESHOLD_DAYS.map((t) => ({ expiresAt: windowFor(now, t) }))
  const rows = await prisma.url.findMany({
    where: { deletedAt: null, isActive: true, userId: { not: null }, OR: or },
    select: { shortCode: true, originalUrl: true, expiresAt: true, user: { select: { email: true, name: true } } },
    orderBy: { expiresAt: 'asc' },
    take: 5000,
  })
  const byOwner = new Map<string, OwnerDigest>()
  for (const r of rows) {
    if (!r.user || !r.expiresAt) continue
    const t = thresholdFor(r.expiresAt, now)
    if (t === null) continue
    const d = byOwner.get(r.user.email) ?? { email: r.user.email, name: r.user.name, links: [] }
    d.links.push({ shortCode: r.shortCode, originalUrl: r.originalUrl, expiresAt: r.expiresAt, thresholdDays: t })
    byOwner.set(r.user.email, d)
  }
  return [...byOwner.values()]
}

export async function sendExpiryDigests(baseUrl: string, now: Date = new Date()): Promise<{ owners: number; links: number; failed: number }> {
  const digests = await collectDigests(now)
  let links = 0
  let failed = 0
  for (const d of digests) {
    const { subject, text } = renderDigest(d, baseUrl)
    const ok = await sendEmail({ to: d.email, subject, text })
    if (ok) links += d.links.length
    else failed++
  }
  return { owners: digests.length, links, failed }
}
