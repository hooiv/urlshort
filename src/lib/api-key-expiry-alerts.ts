import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { API_KEY_EXPIRING_DAYS } from '@/lib/api-key-health'

/**
 * Warn owners by email before an API key expires so integrations don't break
 * silently. De-duplication is a compare-and-set on ApiKey.expiryWarnedAt; a failed
 * send rolls the marker back so the next run retries.
 */
const DAY_MS = 86_400_000

export type ExpiringKey = { id: string; name: string; prefix: string; expiresAt: Date }

export function renderExpiryWarning(name: string | null, keys: ExpiringKey[], baseUrl: string, now = new Date()): { subject: string; text: string } {
  const sorted = [...keys].sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime() || a.id.localeCompare(b.id))
  const lines = sorted.map((k) => {
    const days = Math.max(0, Math.ceil((k.expiresAt.getTime() - now.getTime()) / DAY_MS))
    return `- "${k.name}" (qlk_${k.prefix}…) expires ${k.expiresAt.toISOString().slice(0, 10)} (in ${days} day${days === 1 ? '' : 's'})`
  })
  const subject = sorted.length === 1 ? `API key "${sorted[0].name}" expires soon` : `${sorted.length} API keys expire soon`
  return { subject, text: `${name ? `Hi ${name},\n\n` : ''}These API keys stop working when they expire:\n\n${lines.join('\n')}\n\nRotate them with a grace period so deployments swap secrets without downtime: ${baseUrl}/account\n` }
}

export async function sendApiKeyExpiryWarnings(baseUrl: string, now = new Date()): Promise<{ owners: number; keys: number; failed: number }> {
  const horizon = new Date(now.getTime() + API_KEY_EXPIRING_DAYS * DAY_MS)
  const rows = await prisma.apiKey.findMany({
    where: { revokedAt: null, expiryWarnedAt: null, expiresAt: { gt: now, lte: horizon }, user: { emailVerifiedAt: { not: null } } },
    select: { id: true, name: true, prefix: true, expiresAt: true, user: { select: { id: true, email: true, name: true } } },
    take: 5000,
  })
  const byOwner = new Map<string, { email: string; name: string | null; claimed: ExpiringKey[] }>()
  for (const r of rows) {
    if (!r.expiresAt) continue
    const claim = await prisma.apiKey.updateMany({ where: { id: r.id, expiryWarnedAt: null }, data: { expiryWarnedAt: now } })
    if (claim.count === 0) continue
    const o = byOwner.get(r.user.id) ?? { email: r.user.email, name: r.user.name, claimed: [] }
    o.claimed.push({ id: r.id, name: r.name, prefix: r.prefix, expiresAt: r.expiresAt })
    byOwner.set(r.user.id, o)
  }
  let keys = 0
  let failed = 0
  for (const o of byOwner.values()) {
    const { subject, text } = renderExpiryWarning(o.name, o.claimed, baseUrl, now)
    const ok = await sendEmail({ to: o.email, subject, text })
    if (ok) keys += o.claimed.length
    else {
      failed++
      await prisma.apiKey.updateMany({ where: { id: { in: o.claimed.map((c) => c.id) }, expiryWarnedAt: now }, data: { expiryWarnedAt: null } })
    }
  }
  return { owners: byOwner.size, keys, failed }
}
