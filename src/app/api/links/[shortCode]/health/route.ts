import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hasValidManagementToken } from '@/lib/management'
import { probeDestination, normalizeHealthTarget } from '@/lib/destination-health'
import { rateLimit } from '@/lib/rate-limit'
import { publishWorkspaceRoutingConfig } from '@/lib/routing-config'

const FAILURE_THRESHOLD = 3
const SUCCESS_THRESHOLD = 2

async function authorize(request: NextRequest, shortCode: string) {
  const url = await prisma.url.findUnique({ where: { shortCode } })
  if (!url) return { response: NextResponse.json({ error: 'Short link not found' }, { status: 404 }) }
  if (!hasValidManagementToken(request, url.managementTokenHash)) return { response: NextResponse.json({ error: 'Invalid management token' }, { status: 401 }) }
  return { url }
}

export async function GET(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  const { shortCode } = await context.params
  const auth = await authorize(request, shortCode)
  if ('response' in auth) return auth.response
  const [url, rules, checks] = await Promise.all([
    prisma.url.findUnique({ where: { id: auth.url.id }, select: { healthStatus: true, healthCheckedAt: true, healthLatencyMs: true, healthStatusCode: true, healthLastError: true, healthConsecutiveFailures: true, healthConsecutiveSuccesses: true, autoFailoverEnabled: true, lastHealthyRevisionId: true } }),
    prisma.linkRule.findMany({ where: { urlId: auth.url.id }, orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }], select: { id: true, name: true, destinationUrl: true, enabled: true, healthStatus: true, healthCheckedAt: true, healthLatencyMs: true, healthStatusCode: true, healthLastError: true, consecutiveFailures: true, consecutiveSuccesses: true } }),
    prisma.destinationHealthCheck.findMany({ where: { urlId: auth.url.id }, orderBy: { checkedAt: 'desc' }, take: 30, select: { id: true, revisionId: true, ruleId: true, targetUrl: true, status: true, statusCode: true, latencyMs: true, error: true, checkedAt: true } }),
  ])
  return NextResponse.json({ url, rules, checks })
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  const { shortCode } = await context.params
  const auth = await authorize(request, shortCode)
  if ('response' in auth) return auth.response
  try {
    const body = (await request.json()) as Record<string, unknown>
    if (body.autoFailoverEnabled !== undefined) {
      const enabled = Boolean(body.autoFailoverEnabled)
      const updated = await prisma.url.update({ where: { id: auth.url.id }, data: { autoFailoverEnabled: enabled } })
      if (auth.url.workspaceId) await publishWorkspaceRoutingConfig(auth.url.workspaceId)
      return NextResponse.json({ autoFailoverEnabled: updated.autoFailoverEnabled })
    }
    return NextResponse.json({ error: 'No supported health setting was supplied' }, { status: 400 })
  } catch { return NextResponse.json({ error: 'Unable to update health settings' }, { status: 400 }) }
}

async function updateFallbackHealth(urlId: string, revisionId: string | null, targetUrl: string, result: Awaited<ReturnType<typeof probeDestination>>) {
  const current = await prisma.url.findUnique({ where: { id: urlId }, select: { healthConsecutiveFailures: true, healthConsecutiveSuccesses: true, autoFailoverEnabled: true, lastHealthyRevisionId: true } })
  if (!current) throw new Error('Link not found')
  const wasHealthy = result.status !== 'down'
  const failures = wasHealthy ? 0 : current.healthConsecutiveFailures + 1
  const successes = wasHealthy ? current.healthConsecutiveSuccesses + 1 : 0
  const status = failures >= FAILURE_THRESHOLD ? 'down' : successes >= SUCCESS_THRESHOLD ? 'healthy' : result.status
  const data: Record<string, unknown> = { healthStatus: status, healthCheckedAt: new Date(), healthLatencyMs: result.latencyMs, healthStatusCode: result.statusCode, healthLastError: result.error, healthConsecutiveFailures: failures, healthConsecutiveSuccesses: successes }
  if (status === 'healthy' && revisionId) data.lastHealthyRevisionId = revisionId
  await prisma.url.update({ where: { id: urlId }, data })
  await prisma.destinationHealthCheck.create({ data: { urlId, revisionId, targetUrl, status, statusCode: result.statusCode, latencyMs: result.latencyMs, error: result.error } })
  return status
}

export async function POST(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  const { shortCode } = await context.params
  const auth = await authorize(request, shortCode)
  if ('response' in auth) return auth.response
  // Probes trigger outbound requests to third parties — throttle per link.
  const limit = await rateLimit(request, { name: 'health-probe', identifier: auth.url.id, limit: 10, windowMs: 60_000 })
  if (!limit.allowed) return NextResponse.json({ error: 'Too many health checks. Try again shortly.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } })
  try {
    const body = (await request.json()) as Record<string, unknown>
    const target = typeof body.target === 'string' ? body.target : 'fallback'
    if (target === 'fallback') {
      const now = new Date()
      const revision = await prisma.destinationRevision.findFirst({ where: { urlId: auth.url.id, effectiveAt: { lte: now } }, orderBy: { effectiveAt: 'desc' } })
      const targetUrl = revision?.destinationUrl || auth.url.originalUrl
      const safeTarget = await normalizeHealthTarget(targetUrl)
      const result = await probeDestination(safeTarget)
      const status = await updateFallbackHealth(auth.url.id, revision?.id ?? null, safeTarget, result)
      if (auth.url.workspaceId) await publishWorkspaceRoutingConfig(auth.url.workspaceId)
      return NextResponse.json({ target: 'fallback', status, result })
    }
    const rule = await prisma.linkRule.findFirst({ where: { id: target, urlId: auth.url.id } })
    if (!rule) return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
    const safeTarget = await normalizeHealthTarget(rule.destinationUrl)
    const result = await probeDestination(safeTarget)
    const failures = result.status === 'down' ? rule.consecutiveFailures + 1 : 0
    const successes = result.status === 'down' ? 0 : rule.consecutiveSuccesses + 1
    const status = failures >= FAILURE_THRESHOLD ? 'down' : successes >= SUCCESS_THRESHOLD ? 'healthy' : result.status
    await prisma.$transaction([
      prisma.linkRule.update({ where: { id: rule.id }, data: { healthStatus: status, healthCheckedAt: new Date(), healthLatencyMs: result.latencyMs, healthStatusCode: result.statusCode, healthLastError: result.error, consecutiveFailures: failures, consecutiveSuccesses: successes } }),
      prisma.destinationHealthCheck.create({ data: { urlId: auth.url.id, ruleId: rule.id, targetUrl: safeTarget, status, statusCode: result.statusCode, latencyMs: result.latencyMs, error: result.error } }),
    ])
    if (auth.url.workspaceId) await publishWorkspaceRoutingConfig(auth.url.workspaceId)
    return NextResponse.json({ target: rule.id, status, result })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Health check failed' }, { status: 400 })
  }
}
