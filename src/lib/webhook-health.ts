import { prisma } from './prisma'
import { sendEmail } from './email'

/**
 * Automatic endpoint disabling. An endpoint that keeps failing wastes worker
 * time and workspace delivery quota, so after WEBHOOK_DISABLE_MIN_FAILURES
 * consecutive failed deliveries spanning at least WEBHOOK_DISABLE_MIN_SPAN_MS
 * (a short outage never trips it) the endpoint is switched off and its owner(s)
 * are emailed once. Any success in between resets the streak.
 */

export const WEBHOOK_DISABLE_MIN_FAILURES = 10
export const WEBHOOK_DISABLE_MIN_SPAN_MS = 24 * 60 * 60 * 1000

export type SettledDelivery = { status: 'success' | 'failed'; createdAt: Date }

/** `recent` is newest-first, settled deliveries only. */
export function shouldDisableEndpoint(recent: SettledDelivery[], now: Date = new Date()): boolean {
  let streak = 0
  let oldest: Date | null = null
  for (const d of recent) {
    if (d.status !== 'failed') break
    streak++
    oldest = d.createdAt
  }
  if (streak < WEBHOOK_DISABLE_MIN_FAILURES || !oldest) return false
  return now.getTime() - oldest.getTime() >= WEBHOOK_DISABLE_MIN_SPAN_MS
}

export function disableNotice(url: string, reason: string): { subject: string; text: string } {
  let host = url
  try { host = new URL(url).host } catch { /* keep raw */ }
  return {
    subject: `QuickLink disabled your webhook for ${host}`,
    text: `Your webhook endpoint ${url} was switched off automatically.\n\nReason: ${reason}\n\nFix the receiver, then re-enable the endpoint from Manage → Webhooks. Failed deliveries can be redelivered from its delivery log.`,
  }
}

async function ownerEmails(endpoint: { userId: string | null; workspaceId: string | null }): Promise<string[]> {
  if (endpoint.userId) {
    const u = await prisma.user.findUnique({ where: { id: endpoint.userId }, select: { email: true } })
    return u ? [u.email] : []
  }
  if (endpoint.workspaceId) {
    const members = await prisma.membership.findMany({
      where: { workspaceId: endpoint.workspaceId, role: { in: ['owner', 'admin'] } },
      select: { user: { select: { email: true } } },
    })
    return members.map((m) => m.user.email)
  }
  return []
}

/**
 * Called after a delivery settles as failed. The conditional update makes the
 * disable (and therefore the email) happen exactly once even with concurrent
 * workers.
 */
export async function evaluateEndpointHealth(endpointId: string, now: Date = new Date()): Promise<boolean> {
  const rows = await prisma.webhookDelivery.findMany({
    where: { endpointId, status: { in: ['success', 'failed'] } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: WEBHOOK_DISABLE_MIN_FAILURES + 5,
    select: { status: true, createdAt: true },
  })
  const recent = rows.map((r) => ({ status: r.status as 'success' | 'failed', createdAt: r.createdAt }))
  if (!shouldDisableEndpoint(recent, now)) return false
  const reason = `${WEBHOOK_DISABLE_MIN_FAILURES} consecutive deliveries failed over more than 24 hours`
  const claimed = await prisma.webhookEndpoint.updateMany({
    where: { id: endpointId, isActive: true },
    data: { isActive: false, disabledAt: now, disabledReason: reason },
  })
  if (claimed.count !== 1) return false
  const endpoint = await prisma.webhookEndpoint.findUnique({ where: { id: endpointId }, select: { url: true, userId: true, workspaceId: true } })
  if (endpoint) {
    const notice = disableNotice(endpoint.url, reason)
    for (const to of await ownerEmails(endpoint)) await sendEmail({ to, ...notice })
  }
  return true
}
