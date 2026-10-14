import type { Prisma } from '@prisma/client'

type Db = Pick<Prisma.TransactionClient, 'commission'>

export type StatementLine = {
  currency: string
  pendingCents: number
  approvedCents: number
  paidCents: number
  reversedCents: number
  clawbackCents: number
  /** approved − clawbacks: what is payable on the next payout run. */
  netPayableCents: number
  count: number
}

export type PayoutStatement = { month: string; from: string; to: string; lines: StatementLine[] }

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/

/** Parses YYYY-MM into a half-open UTC range; null when malformed. */
export function monthRange(month: string): { from: Date; to: Date } | null {
  const m = MONTH_RE.exec(month)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  return { from: new Date(Date.UTC(y, mo, 1)), to: new Date(Date.UTC(y, mo + 1, 1)) }
}

type Row = { currency: string | null; status: string; _sum: { amountCents: number | null; clawbackCents: number | null }; _count: { _all: number } }

/** Pure fold of grouped commission rows into per-currency statement lines. */
export function foldStatement(rows: Row[]): StatementLine[] {
  const by = new Map<string, StatementLine>()
  for (const r of rows) {
    const cur = (r.currency ?? 'usd').toLowerCase()
    const l = by.get(cur) ?? { currency: cur, pendingCents: 0, approvedCents: 0, paidCents: 0, reversedCents: 0, clawbackCents: 0, netPayableCents: 0, count: 0 }
    const amt = r._sum.amountCents ?? 0
    if (r.status === 'pending') l.pendingCents += amt
    else if (r.status === 'approved') l.approvedCents += amt
    else if (r.status === 'paid') l.paidCents += amt
    else if (r.status === 'reversed') l.reversedCents += amt
    l.clawbackCents += r._sum.clawbackCents ?? 0
    l.count += r._count._all
    by.set(cur, l)
  }
  const lines = [...by.values()]
  for (const l of lines) l.netPayableCents = Math.max(0, l.approvedCents - l.clawbackCents)
  return lines.sort((a, b) => a.currency.localeCompare(b.currency))
}

export async function buildPayoutStatement(db: Db, userId: string, month: string): Promise<PayoutStatement | null> {
  const range = monthRange(month)
  if (!range) return null
  const rows = await db.commission.groupBy({
    by: ['currency', 'status'],
    where: { userId, createdAt: { gte: range.from, lt: range.to } },
    _sum: { amountCents: true, clawbackCents: true },
    _count: { _all: true },
  })
  return { month, from: range.from.toISOString(), to: range.to.toISOString(), lines: foldStatement(rows as Row[]) }
}
