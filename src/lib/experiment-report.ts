import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { analyzeExperiment, DEFAULT_CONFIDENCE, type ExperimentReport } from './experiment-significance'

/**
 * Loads per-rule human clicks and distinct converting visitors for a link's
 * enabled routing rules and runs the significance analysis. Shared by the
 * experiment read-out and the winner-promotion guard so both give the same verdict.
 */
export async function loadExperimentReport(
  urlId: string,
  opts: { days?: number; goalId?: string | null; controlId?: string; confidence?: number } = {},
): Promise<ExperimentReport> {
  const days = opts.days ?? 30
  const since = new Date(Date.now() - days * 86_400_000)
  const rules = await prisma.linkRule.findMany({ where: { urlId, enabled: true }, select: { id: true, name: true }, orderBy: { createdAt: 'asc' } })
  const ids = rules.map((r) => r.id)
  const [clickRows, convRows] = ids.length
    ? await Promise.all([
        prisma.$queryRaw<{ ruleId: string; n: bigint }[]>(Prisma.sql`SELECT "ruleId", COUNT(*)::bigint AS n FROM click_events WHERE "urlId" = ${urlId} AND "ruleId" IN (${Prisma.join(ids)}) AND "createdAt" >= ${since} AND "trafficType" = 'human' GROUP BY "ruleId"`),
        prisma.$queryRaw<{ ruleId: string; n: bigint }[]>(Prisma.sql`SELECT "ruleId", COUNT(DISTINCT COALESCE("visitorIdHash", id))::bigint AS n FROM conversion_events WHERE "urlId" = ${urlId} AND "ruleId" IN (${Prisma.join(ids)}) AND "createdAt" >= ${since} ${opts.goalId ? Prisma.sql`AND "goalId" = ${opts.goalId}` : Prisma.empty} GROUP BY "ruleId"`),
      ])
    : [[], []]
  const clicks = new Map(clickRows.map((r) => [r.ruleId, Number(r.n)]))
  const convs = new Map(convRows.map((r) => [r.ruleId, Number(r.n)]))
  return analyzeExperiment(
    rules.map((r) => ({ id: r.id, name: r.name, clicks: clicks.get(r.id) ?? 0, conversions: convs.get(r.id) ?? 0 })),
    { controlId: opts.controlId, confidence: opts.confidence ?? DEFAULT_CONFIDENCE },
  )
}

export type PromotionVerdict = { allowed: true } | { allowed: false; reason: string }

/** A variant may be promoted under requireWinner only when the analysis names it the winner. */
export function promotionVerdict(report: ExperimentReport, ruleId: string): PromotionVerdict {
  if (report.status === 'winner' && report.winnerId === ruleId) return { allowed: true }
  if (report.status === 'winner') return { allowed: false, reason: 'A different variant is the statistically significant winner.' }
  return { allowed: false, reason: report.note }
}
