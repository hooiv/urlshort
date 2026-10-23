import type { Prisma, PrismaClient } from '@prisma/client'

/** Signals that a pending commission deserves a human look before it is approved. */
export const RISK_SIGNALS = ['instant_conversion', 'no_click', 'repeat_visitor', 'burst', 'single_ip_cluster'] as const
export type RiskSignal = (typeof RISK_SIGNALS)[number]

export const INSTANT_CONVERSION_MS = 3_000
export const REPEAT_VISITOR_LIMIT = 3
export const BURST_WINDOW_MS = 10 * 60_000
export const BURST_LIMIT = 5
export const IP_CLUSTER_LIMIT = 4

export interface RiskInput {
  commissionId: string
  conversionId: string
  urlId: string
  conversionAt: Date
  clickAt: Date | null
  visitorIdHash: string | null
  ip: string | null
}

export interface RiskResult {
  commissionId: string
  score: number
  level: 'low' | 'medium' | 'high'
  signals: RiskSignal[]
}

const WEIGHTS: Record<RiskSignal, number> = { instant_conversion: 35, no_click: 25, repeat_visitor: 30, burst: 25, single_ip_cluster: 30 }

export function riskLevel(score: number): RiskResult['level'] {
  return score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low'
}

/** Pure scorer over a batch of conversions; sibling context (same link) is derived from the batch itself. */
export function scoreCommissionRisk(rows: RiskInput[]): RiskResult[] {
  const byVisitor = new Map<string, number>()
  const byIp = new Map<string, number>()
  const byLink = new Map<string, number[]>()
  for (const r of rows) {
    if (r.visitorIdHash) byVisitor.set(`${r.urlId}:${r.visitorIdHash}`, (byVisitor.get(`${r.urlId}:${r.visitorIdHash}`) ?? 0) + 1)
    if (r.ip) byIp.set(`${r.urlId}:${r.ip}`, (byIp.get(`${r.urlId}:${r.ip}`) ?? 0) + 1)
    const times = byLink.get(r.urlId) ?? []
    times.push(r.conversionAt.getTime())
    byLink.set(r.urlId, times)
  }
  for (const times of byLink.values()) times.sort((a, b) => a - b)

  return rows.map((r) => {
    const signals: RiskSignal[] = []
    if (!r.clickAt) signals.push('no_click')
    else if (r.conversionAt.getTime() - r.clickAt.getTime() < INSTANT_CONVERSION_MS) signals.push('instant_conversion')
    if (r.visitorIdHash && (byVisitor.get(`${r.urlId}:${r.visitorIdHash}`) ?? 0) >= REPEAT_VISITOR_LIMIT) signals.push('repeat_visitor')
    if (r.ip && (byIp.get(`${r.urlId}:${r.ip}`) ?? 0) >= IP_CLUSTER_LIMIT) signals.push('single_ip_cluster')
    const t = r.conversionAt.getTime()
    const inWindow = (byLink.get(r.urlId) ?? []).filter((x) => Math.abs(x - t) <= BURST_WINDOW_MS).length
    if (inWindow >= BURST_LIMIT) signals.push('burst')
    const score = Math.min(100, signals.reduce((s, k) => s + WEIGHTS[k], 0))
    return { commissionId: r.commissionId, score, level: riskLevel(score), signals }
  })
}

type Db = Pick<PrismaClient, 'commission'> | Prisma.TransactionClient

/** Score the owner's pending/approved commissions (newest first, capped) from their conversions and click records. */
export async function assessCommissionRisk(db: Db, userId: string, opts: { statuses?: string[]; limit?: number } = {}): Promise<RiskResult[]> {
  const rows = await db.commission.findMany({
    where: { userId, status: { in: opts.statuses ?? ['pending', 'approved'] } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: Math.min(Math.max(opts.limit ?? 500, 1), 1000),
    select: { id: true, conversionId: true, urlId: true, conversion: { select: { createdAt: true, visitorIdHash: true, clickEvent: { select: { createdAt: true, ip: true } } } } },
  })
  return scoreCommissionRisk(
    rows.map((r) => ({
      commissionId: r.id,
      conversionId: r.conversionId,
      urlId: r.urlId,
      conversionAt: r.conversion.createdAt,
      clickAt: r.conversion.clickEvent?.createdAt ?? null,
      visitorIdHash: r.conversion.visitorIdHash,
      ip: r.conversion.clickEvent?.ip ?? null,
    })),
  )
}
