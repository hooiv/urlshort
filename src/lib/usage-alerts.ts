import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import type { UsageMetric } from '@prisma/client'

/**
 * Monthly quota alerts. A workspace owner/admin is emailed once per metric per
 * month when usage first crosses 80% and again at 100%. The unique row in
 * usage_alerts is the dedupe key, so overlapping cron runs cannot double-send.
 */
export const USAGE_ALERT_THRESHOLDS = [80, 100] as const
export const ALERTED_METRICS: { metric: UsageMetric; field: 'clicksPerMonth' | 'apiRequestsPerMonth' | 'conversionsPerMonth' | 'webhookDeliveriesPerMonth'; label: string }[] = [
  { metric: 'clicks', field: 'clicksPerMonth', label: 'clicks' },
  { metric: 'api_requests', field: 'apiRequestsPerMonth', label: 'API requests' },
  { metric: 'conversions', field: 'conversionsPerMonth', label: 'tracked conversions' },
  { metric: 'webhook_deliveries', field: 'webhookDeliveriesPerMonth', label: 'webhook deliveries' },
]

/** Highest threshold reached, or null. Zero or invalid limits never alert. */
export function crossedThreshold(used: bigint, limit: bigint): number | null {
  if (limit <= 0n || used < 0n) return null
  let hit: number | null = null
  for (const t of USAGE_ALERT_THRESHOLDS) if (used * 100n >= limit * BigInt(t)) hit = t
  return hit
}

export type UsageAlertItem = { metric: UsageMetric; label: string; threshold: number; used: bigint; limit: bigint }

export function renderUsageAlert(workspaceName: string, periodKey: string, items: UsageAlertItem[], baseUrl: string): { subject: string; text: string } {
  const over = items.some((i) => i.threshold >= 100)
  const lines = items.map((i) => {
    const pct = Number((i.used * 1000n) / i.limit) / 10
    return `- ${i.label}: ${i.used.toLocaleString('en-US')} of ${i.limit.toLocaleString('en-US')} (${pct}%)${i.threshold >= 100 ? ' limit reached' : ''}`
  })
  return {
    subject: over ? `${workspaceName} reached a monthly limit` : `${workspaceName} is at 80% of a monthly limit`,
    text: `Usage for ${workspaceName} in ${periodKey}:\n\n${lines.join('\n')}\n\n${over ? 'Further usage of the capped metrics is blocked until the month resets or the limit is raised.' : 'Raise the limit before it is reached to avoid blocked requests.'}\n\n${baseUrl}/manage\n`,
  }
}

export async function sendUsageAlerts(baseUrl: string, now: Date = new Date()): Promise<{ workspaces: number; alerts: number; emailed: number }> {
  const periodKey = now.toISOString().slice(0, 7)
  const buckets = await prisma.usageBucket.findMany({
    where: { periodKey, metric: { in: ALERTED_METRICS.map((m) => m.metric) }, workspace: { tenantQuota: { isNot: null } } },
    select: { workspaceId: true, metric: true, quantity: true, workspace: { select: { name: true, tenantQuota: true, usageAlerts: { where: { periodKey }, select: { metric: true, threshold: true } } } } },
    take: 20000,
  })
  const byWs = new Map<string, { name: string; items: UsageAlertItem[] }>()
  for (const b of buckets) {
    const q = b.workspace.tenantQuota
    const def = ALERTED_METRICS.find((m) => m.metric === b.metric)
    if (!q || !def) continue
    const limit = BigInt(q[def.field])
    const t = crossedThreshold(b.quantity, limit)
    if (t === null) continue
    if (b.workspace.usageAlerts.some((a) => a.metric === b.metric && a.threshold >= t)) continue
    const e = byWs.get(b.workspaceId) ?? { name: b.workspace.name, items: [] }
    e.items.push({ metric: b.metric, label: def.label, threshold: t, used: b.quantity, limit })
    byWs.set(b.workspaceId, e)
  }
  let alerts = 0
  let emailed = 0
  for (const [workspaceId, { name, items }] of byWs) {
    // Claim first: only items we insert are ours to send, so concurrent runs cannot double-send.
    const claimed: UsageAlertItem[] = []
    for (const i of items) {
      const r = await prisma.usageAlert.createMany({ data: [{ workspaceId, metric: i.metric, periodKey, threshold: i.threshold }], skipDuplicates: true })
      if (r.count === 1) claimed.push(i)
    }
    if (!claimed.length) continue
    alerts += claimed.length
    const admins = await prisma.membership.findMany({ where: { workspaceId, role: { in: ['owner', 'admin'] } }, select: { user: { select: { email: true } } } })
    const { subject, text } = renderUsageAlert(name, periodKey, claimed, baseUrl)
    for (const a of admins) if (a.user.email && (await sendEmail({ to: a.user.email, subject, text }))) emailed++
  }
  return { workspaces: byWs.size, alerts, emailed }
}
