import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getManageableUrl } from '@/lib/authorization'
import { bayesianReport } from '@/lib/experiment-bayesian'
import { decideExperiment } from '@/lib/experiment-decision'
import { analyzeExperiment, DEFAULT_CONFIDENCE, requiredClicksPerVariant, daysToSampleSize } from '@/lib/experiment-significance'

/**
 * GET /api/links/:code/experiment?days=30&goalId=...&control=<ruleId>&confidence=0.95
 * Per-variant clicks, unique conversions, lift and significance for the link's
 * enabled routing rules. Conversions count distinct converting visitors
 * (falling back to the event id when the visitor is unknown).
 */
export async function GET(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  const { shortCode } = await context.params
  const access = await getManageableUrl(request, shortCode)
  if (!access.url) return NextResponse.json({ error: access.error }, { status: access.status })
  const params = request.nextUrl.searchParams
  const days = params.get('days') === null ? 30 : Number(params.get('days'))
  if (!Number.isInteger(days) || days < 1 || days > 365) return NextResponse.json({ error: 'days must be an integer between 1 and 365' }, { status: 400 })
  const confidence = params.get('confidence') === null ? DEFAULT_CONFIDENCE : Number(params.get('confidence'))
  if (!(confidence >= 0.8 && confidence <= 0.999)) return NextResponse.json({ error: 'confidence must be between 0.8 and 0.999' }, { status: 400 })
  const lift = params.get('lift') === null ? 0.1 : Number(params.get('lift'))
  if (!(lift > 0 && lift <= 5)) return NextResponse.json({ error: 'lift must be a relative fraction in (0, 5]' }, { status: 400 })
  const goalId = params.get('goalId')
  const control = params.get('control') ?? undefined

  const rules = await prisma.linkRule.findMany({ where: { urlId: access.url.id, enabled: true }, select: { id: true, name: true }, orderBy: { createdAt: 'asc' } })
  if (control && !rules.some((r) => r.id === control)) return NextResponse.json({ error: 'control is not an enabled rule of this link' }, { status: 400 })
  if (goalId) {
    const goal = await prisma.goal.findFirst({ where: { id: goalId, urlId: access.url.id }, select: { id: true } })
    if (!goal) return NextResponse.json({ error: 'Goal not found for this link' }, { status: 404 })
  }
  const since = new Date(Date.now() - days * 86_400_000)
  const ids = rules.map((r) => r.id)
  const [clickRows, convRows] = ids.length
    ? await Promise.all([
        prisma.$queryRaw<{ ruleId: string; n: bigint }[]>(Prisma.sql`SELECT "ruleId", COUNT(*)::bigint AS n FROM click_events WHERE "urlId" = ${access.url.id} AND "ruleId" IN (${Prisma.join(ids)}) AND "createdAt" >= ${since} AND "trafficType" = 'human' GROUP BY "ruleId"`),
        prisma.$queryRaw<{ ruleId: string; n: bigint }[]>(Prisma.sql`SELECT "ruleId", COUNT(DISTINCT COALESCE("visitorIdHash", id))::bigint AS n FROM conversion_events WHERE "urlId" = ${access.url.id} AND "ruleId" IN (${Prisma.join(ids)}) AND "createdAt" >= ${since} ${goalId ? Prisma.sql`AND "goalId" = ${goalId}` : Prisma.empty} GROUP BY "ruleId"`),
      ])
    : [[], []]
  const clicks = new Map(clickRows.map((r) => [r.ruleId, Number(r.n)]))
  const convs = new Map(convRows.map((r) => [r.ruleId, Number(r.n)]))
  const report = analyzeExperiment(rules.map((r) => ({ id: r.id, name: r.name, clicks: clicks.get(r.id) ?? 0, conversions: convs.get(r.id) ?? 0 })), { controlId: control, confidence })
  const totalClicks = report.variants.reduce((a, v) => a + v.clicks, 0)
  const totalConv = report.variants.reduce((a, v) => a + v.conversions, 0)
  const plan = totalClicks > 0 ? requiredClicksPerVariant(totalConv / totalClicks, lift, { confidence }) : null
  const daysRemaining = plan ? daysToSampleSize(plan, report.variants, days) : null
  const controlId = report.control
  const bayesian = controlId && report.variants.length > 1 ? bayesianReport(report.variants.map((v) => ({ id: v.id, name: v.name, clicks: v.clicks, conversions: v.conversions })), controlId) : []
  const decision = decideExperiment(report, bayesian, plan)
  return NextResponse.json({ shortCode, days, confidence, goalId: goalId ?? null, ...report, bayesian, plan: plan ? { ...plan, daysRemaining } : null, decision })
}
