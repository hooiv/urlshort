import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { normalizeHealthTarget, probeDestination } from '@/lib/destination-health'

const FAILURE_THRESHOLD = 3
const SUCCESS_THRESHOLD = 2
const MAX_LINKS_PER_SWEEP = 50
const CONCURRENCY = 5

function authorized(request: NextRequest): boolean {
  const secret = process.env.HEALTH_SWEEP_SECRET
  if (!secret) return false
  // Custom header (self-hosted cron) or Vercel's `Authorization: Bearer $CRON_SECRET`.
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
  const candidates = [request.headers.get('x-health-sweep-secret') || '', process.env.CRON_SECRET && bearer === process.env.CRON_SECRET ? bearer : '']
  const expected = Buffer.from(secret, 'utf8')
  return candidates.some((candidate) => {
    if (!candidate) return false
    const actual = Buffer.from(candidate, 'utf8')
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  })
}

async function checkUrl(url: { id: string; originalUrl: string; autoFailoverEnabled: boolean; healthConsecutiveFailures: number; healthConsecutiveSuccesses: number }) {
  const now = new Date()
  const revision = await prisma.destinationRevision.findFirst({ where: { urlId: url.id, effectiveAt: { lte: now } }, orderBy: { effectiveAt: 'desc' } })
  const target = await normalizeHealthTarget(revision?.destinationUrl || url.originalUrl)
  const result = await probeDestination(target)
  const failures = result.status === 'down' ? url.healthConsecutiveFailures + 1 : 0
  const successes = result.status === 'down' ? 0 : url.healthConsecutiveSuccesses + 1
  const status = failures >= FAILURE_THRESHOLD ? 'down' : successes >= SUCCESS_THRESHOLD ? 'healthy' : result.status
  const update: Record<string, unknown> = { healthStatus: status, healthCheckedAt: now, healthLatencyMs: result.latencyMs, healthStatusCode: result.statusCode, healthLastError: result.error, healthConsecutiveFailures: failures, healthConsecutiveSuccesses: successes }
  if (status === 'healthy' && revision) update.lastHealthyRevisionId = revision.id
  await prisma.$transaction([
    prisma.url.update({ where: { id: url.id }, data: update }),
    prisma.destinationHealthCheck.create({ data: { urlId: url.id, revisionId: revision?.id, targetUrl: target, status, statusCode: result.statusCode, latencyMs: result.latencyMs, error: result.error } }),
  ])
  return { shortCode: (await prisma.url.findUnique({ where: { id: url.id }, select: { shortCode: true } }))?.shortCode, status, latencyMs: result.latencyMs }
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const links = await prisma.url.findMany({ where: { isActive: true }, orderBy: { healthCheckedAt: 'asc' }, take: MAX_LINKS_PER_SWEEP, select: { id: true, shortCode: true, originalUrl: true, autoFailoverEnabled: true, healthConsecutiveFailures: true, healthConsecutiveSuccesses: true } })
  const results: Array<Record<string, unknown>> = []
  for (let i = 0; i < links.length; i += CONCURRENCY) {
    const batch = links.slice(i, i + CONCURRENCY)
    const settled = await Promise.allSettled(batch.map((link) => checkUrl(link)))
    for (let j = 0; j < settled.length; j += 1) {
      const item = settled[j]
      results.push(item.status === 'fulfilled' ? item.value : { shortCode: batch[j].shortCode, status: 'error', error: item.reason instanceof Error ? item.reason.message : 'Probe failed' })
    }
  }
  return NextResponse.json({ checked: results.length, results })
}

/** Vercel Cron triggers GET requests; same authorization, same work. */
export async function GET(request: NextRequest) {
  return POST(request)
}
