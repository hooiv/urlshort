import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { timingSafeEqual } from 'node:crypto'
import { rateLimit } from '@/lib/rate-limit'

/**
 * POST /api/maintenance/sweep — data retention cleanup for expired rows.
 *
 * Call from a cron (every 1–6 hours) with the `x-health-sweep-secret` header
 * (same secret as the health sweep). Deletes, in bounded batches:
 *  - expired/revoked sessions older than 7 days past expiry
 *  - used/expired password-reset and email-verification tokens older than 7 days
 *  - expired, unaccepted workspace invites older than 30 days past expiry
 *  - raw click/conversion events older than RETENTION_DAYS (default 180) —
 *    daily rollup tables (click_daily / conversion_daily) keep aggregates
 *
 * Returns per-table deletion counts so the cron log is auditable.
 */

const RETENTION_DAYS = Number(process.env.EVENT_RETENTION_DAYS || 180)
const BATCH_SIZE = 5_000

function timingSafeMatches(candidate: string, expectedSecret: string): boolean {
  if (!candidate || !expectedSecret) return false
  const actual = Buffer.from(candidate, 'utf8')
  const expected = Buffer.from(expectedSecret, 'utf8')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function isSweepAuthorized(
  bearer: string,
  sweepHeader: string,
  cronHeader: string,
  healthSecret: string | undefined,
  cronSecret: string | undefined,
): boolean {
  if (healthSecret && (timingSafeMatches(sweepHeader, healthSecret) || timingSafeMatches(bearer, healthSecret))) return true
  if (cronSecret && (timingSafeMatches(bearer, cronSecret) || timingSafeMatches(cronHeader, cronSecret))) return true
  return false
}

function authorized(request: NextRequest): boolean {
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
  return isSweepAuthorized(
    bearer,
    request.headers.get('x-health-sweep-secret') || '',
    request.headers.get('x-cron-secret') || '',
    process.env.HEALTH_SWEEP_SECRET,
    process.env.CRON_SECRET,
  )
}

function cutoff(daysAgo: number): Date {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
}

type BatchDelegate = {
  findMany: (args: { where: Record<string, unknown>; select: { id: true }; take: number }) => Promise<Array<{ id: string }>>
  deleteMany: (args: { where: Record<string, unknown> }) => Promise<{ count: number }>
}

async function deleteInBatches(delegate: BatchDelegate, where: Record<string, unknown>): Promise<number> {
  let total = 0
  // Bounded loop: at most 20 batches of BATCH_SIZE per table per sweep to keep
  // runtime short. Each batch selects up to BATCH_SIZE ids then deletes only
  // those ids, so a single sweep can remove at most 20 * BATCH_SIZE rows per
  // table and repeated sweeps converge idempotently.
  for (let batch = 0; batch < 20; batch += 1) {
    const rows = await delegate.findMany({ where, select: { id: true }, take: BATCH_SIZE })
    if (rows.length === 0) break
    const result = await delegate.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } })
    total += result.count
    if (rows.length < BATCH_SIZE) break
  }
  return total
}

async function expireLinksInBatches(now: Date): Promise<number> {
  const where = { expiresAt: { lte: now }, isActive: true }
  let total = 0
  for (let batch = 0; batch < 20; batch += 1) {
    const rows = await prisma.url.findMany({ where, select: { id: true }, take: BATCH_SIZE })
    if (rows.length === 0) break
    const result = await prisma.url.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { isActive: false } })
    total += result.count
    if (rows.length < BATCH_SIZE) break
  }
  return total
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const limit = await rateLimit(request, { name: 'retention-sweep', limit: 4, windowMs: 60 * 60_000 })
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const results: Record<string, number> = {}
  const now = new Date()

  // Sessions: expired or revoked more than 7 days ago.
  results.expiredSessions = await deleteInBatches(prisma.session, {
    OR: [
      { expiresAt: { lt: cutoff(7) } },
      { revokedAt: { not: null, lt: cutoff(7) } },
    ],
  })

  // Single-use tokens: consumed or expired more than 7 days ago.
  results.usedResetTokens = await deleteInBatches(prisma.passwordResetToken, {
    OR: [
      { usedAt: { not: null, lt: cutoff(7) } },
      { expiresAt: { lt: cutoff(7) } },
    ],
  })
  results.usedVerificationTokens = await deleteInBatches(prisma.emailVerificationToken, {
    OR: [
      { usedAt: { not: null, lt: cutoff(7) } },
      { expiresAt: { lt: cutoff(7) } },
    ],
  })

  // Invites: expired (or revoked) and never accepted, 30 days past expiry.
  results.staleInvites = await deleteInBatches(prisma.workspaceInvite, {
    acceptedAt: null,
    expiresAt: { lt: cutoff(30) },
  })

  // Expire links automatically at their configured deadline. The redirect path also
  // enforces expiry synchronously; this sweep makes management state converge.
  results.expiredLinks = await expireLinksInBatches(now)

  // Raw events beyond the retention window (aggregates live in *Daily tables).
  const eventCutoff = cutoff(RETENTION_DAYS)
  results.oldClickEvents = await deleteInBatches(prisma.clickEvent, { createdAt: { lt: eventCutoff } })
  results.oldConversionEvents = await deleteInBatches(prisma.conversionEvent, { createdAt: { lt: eventCutoff } })
  results.oldHealthChecks = await deleteInBatches(prisma.destinationHealthCheck, { checkedAt: { lt: cutoff(RETENTION_DAYS) } })
  results.oldAuditEvents = await deleteInBatches(prisma.auditEvent, { createdAt: { lt: cutoff(RETENTION_DAYS) } })

  return NextResponse.json({ sweptAt: now.toISOString(), retentionDays: RETENTION_DAYS, results })
}

/** Vercel Cron triggers GET requests; same authorization, same work. */
export async function GET(request: NextRequest) {
  return POST(request)
}
