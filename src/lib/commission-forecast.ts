import type { Prisma, PrismaClient } from '@prisma/client'

type Db = PrismaClient | Prisma.TransactionClient

export type ForecastRow = { status: string; amountCents: number; clawbackCents: number; currency: string | null; holdUntil: Date | null }

export type ForecastBucket = { label: 'payable_now' | 'releases_7d' | 'releases_30d' | 'releases_later' | 'approved_unpaid'; cents: number; count: number }
export type CommissionForecast = {
  currency: string
  buckets: ForecastBucket[]
  /** Clawbacks (refunds after payout) to be netted from the next payout. */
  clawbackCents: number
  /** Total still owed: payable_now + approved + all pending, minus clawbacks. */
  netOwedCents: number
}

const DAY = 86_400_000

/** Pure fold: bucket unpaid commissions by when their refund-hold window ends. One currency per call. */
export function foldForecast(rows: ForecastRow[], now: Date, currency: string): CommissionForecast {
  const acc: Record<ForecastBucket['label'], ForecastBucket> = {
    payable_now: { label: 'payable_now', cents: 0, count: 0 },
    releases_7d: { label: 'releases_7d', cents: 0, count: 0 },
    releases_30d: { label: 'releases_30d', cents: 0, count: 0 },
    releases_later: { label: 'releases_later', cents: 0, count: 0 },
    approved_unpaid: { label: 'approved_unpaid', cents: 0, count: 0 },
  }
  let clawback = 0
  for (const r of rows) {
    if ((r.currency ?? 'usd').toLowerCase() !== currency) continue
    clawback += r.clawbackCents
    if (r.status === 'approved') { acc.approved_unpaid.cents += r.amountCents; acc.approved_unpaid.count++; continue }
    if (r.status !== 'pending') continue
    const wait = r.holdUntil ? r.holdUntil.getTime() - now.getTime() : 0
    const key = wait <= 0 ? 'payable_now' : wait <= 7 * DAY ? 'releases_7d' : wait <= 30 * DAY ? 'releases_30d' : 'releases_later'
    acc[key].cents += r.amountCents
    acc[key].count++
  }
  const buckets = Object.values(acc)
  const owed = buckets.reduce((s, b) => s + b.cents, 0)
  return { currency, buckets, clawbackCents: clawback, netOwedCents: Math.max(0, owed - clawback) }
}

/** Forecast of what the account owes in commissions, by hold-window release date, per currency. */
export async function buildCommissionForecast(db: Db, userId: string, now = new Date()): Promise<CommissionForecast[]> {
  const rows = await db.commission.findMany({
    where: { userId, OR: [{ status: { in: ['pending', 'approved'] } }, { status: 'paid', clawbackCents: { gt: 0 } }] },
    select: { status: true, amountCents: true, clawbackCents: true, currency: true, holdUntil: true },
    take: 50_000,
  })
  const currencies = [...new Set(rows.map((r) => (r.currency ?? 'usd').toLowerCase()))].sort()
  return currencies.map((c) => foldForecast(rows, now, c))
}
