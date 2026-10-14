import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'

/**
 * Daily owner alert for custom domains whose TLS certificate is about to expire
 * or is currently failing. A run covers one 24h window per threshold, so with a
 * daily cron a domain is mentioned once per threshold. Failing domains are
 * repeated daily until fixed.
 */
export const DOMAIN_EXPIRY_THRESHOLD_DAYS = [14, 3, 1] as const
const DAY = 86_400_000

export type DomainAlertReason = { kind: 'expiring'; thresholdDays: number; expiresAt: Date } | { kind: 'failed' }
export type DomainAlert = { host: string; reason: DomainAlertReason }
export type DomainOwnerAlerts = { email: string; name: string | null; alerts: DomainAlert[] }

export function expiryWindow(now: Date, thresholdDays: number): { gt: Date; lte: Date } {
  return { gt: new Date(now.getTime() + (thresholdDays - 1) * DAY), lte: new Date(now.getTime() + thresholdDays * DAY) }
}

/** The smallest threshold whose window contains the expiry. Expiries beyond the widest window or already past return null. */
export function expiryThreshold(expiresAt: Date, now: Date): number | null {
  for (const t of DOMAIN_EXPIRY_THRESHOLD_DAYS) {
    const w = expiryWindow(now, t)
    if (expiresAt > w.gt && expiresAt <= w.lte) return t
  }
  return null
}

export function renderDomainAlerts(o: DomainOwnerAlerts, baseUrl: string): { subject: string; text: string } {
  const rank = (a: DomainAlert) => (a.reason.kind === 'failed' ? 0 : 1)
  const sorted = [...o.alerts].sort((a, b) => rank(a) - rank(b) || a.host.localeCompare(b.host))
  const lines = sorted.map((a) =>
    a.reason.kind === 'failed'
      ? `- ${a.host}: TLS certificate is not valid right now. Visitors may see browser warnings.`
      : `- ${a.host}: certificate expires ${a.reason.expiresAt.toISOString().slice(0, 10)} (${a.reason.thresholdDays === 1 ? 'within a day' : `within ${a.reason.thresholdDays} days`}) and has not renewed yet.`
  )
  const n = sorted.length
  return {
    subject: `${n} custom domain${n === 1 ? '' : 's'} need${n === 1 ? 's' : ''} attention`,
    text: `${o.name ? `Hi ${o.name},\n\n` : ''}Certificate problems on your custom domains:\n\n${lines.join('\n')}\n\nCheck DNS and renewal status: ${baseUrl}/manage\n`,
  }
}

export async function collectDomainAlerts(now: Date = new Date()): Promise<DomainOwnerAlerts[]> {
  const windows = DOMAIN_EXPIRY_THRESHOLD_DAYS.map((t) => ({ tlsCertificateExpiresAt: expiryWindow(now, t) }))
  const rows = await prisma.brandedDomain.findMany({
    where: { status: 'verified', owner: { is: { userId: { not: null }, deletedAt: null } }, OR: [{ tlsStatus: 'failed' }, ...windows] },
    select: { host: true, tlsStatus: true, tlsCertificateExpiresAt: true, owner: { select: { user: { select: { email: true, name: true } } } } },
    orderBy: { host: 'asc' },
    take: 5000,
  })
  const byOwner = new Map<string, DomainOwnerAlerts>()
  for (const r of rows) {
    const user = r.owner?.user
    if (!user) continue
    let reason: DomainAlertReason | null = null
    if (r.tlsStatus === 'failed') reason = { kind: 'failed' }
    else if (r.tlsCertificateExpiresAt) {
      const t = expiryThreshold(r.tlsCertificateExpiresAt, now)
      if (t !== null) reason = { kind: 'expiring', thresholdDays: t, expiresAt: r.tlsCertificateExpiresAt }
    }
    if (!reason) continue
    const o = byOwner.get(user.email) ?? { email: user.email, name: user.name, alerts: [] }
    o.alerts.push({ host: r.host, reason })
    byOwner.set(user.email, o)
  }
  return [...byOwner.values()]
}

export async function sendDomainAlerts(baseUrl: string, now: Date = new Date()): Promise<{ owners: number; domains: number; failed: number }> {
  const owners = await collectDomainAlerts(now)
  let domains = 0
  let failed = 0
  for (const o of owners) {
    const { subject, text } = renderDomainAlerts(o, baseUrl)
    if (await sendEmail({ to: o.email, subject, text })) domains += o.alerts.length
    else failed++
  }
  return { owners: owners.length, domains, failed }
}
