import { describe, expect, it, vi } from 'vitest'
import { buildPayoutStatement, foldStatement, monthRange } from './payout-statement'

const row = (currency: string | null, status: string, amt: number, claw: number, n: number) => ({ currency, status, _sum: { amountCents: amt, clawbackCents: claw }, _count: { _all: n } })

describe('payout statement', () => {
  it('parses months as half-open UTC ranges', () => {
    expect(monthRange('2026-12')).toEqual({ from: new Date('2026-12-01T00:00:00Z'), to: new Date('2027-01-01T00:00:00Z') })
    for (const bad of ['2026-13', '2026-00', '26-01', '2026-1', '', '2026-01-01']) expect(monthRange(bad)).toBeNull()
  })
  it('folds per currency with net payable floored at zero', () => {
    const lines = foldStatement([row('USD', 'approved', 5000, 800, 3), row(null, 'paid', 1000, 0, 1), row('eur', 'approved', 100, 900, 1), row('eur', 'pending', 50, 0, 1), row('eur', 'reversed', 70, 0, 1)])
    expect(lines.map((l) => l.currency)).toEqual(['eur', 'usd'])
    const usd = lines[1]
    expect(usd).toMatchObject({ approvedCents: 5000, paidCents: 1000, clawbackCents: 800, netPayableCents: 4200, count: 4 })
    expect(lines[0]).toMatchObject({ netPayableCents: 0, pendingCents: 50, reversedCents: 70, count: 3 })
  })
  it('queries by owner and month and rejects bad months', async () => {
    const groupBy = vi.fn().mockResolvedValue([row('usd', 'approved', 10, 0, 1)])
    const s = await buildPayoutStatement({ commission: { groupBy } } as never, 'u1', '2026-10')
    expect(s?.lines[0].netPayableCents).toBe(10)
    expect(groupBy.mock.calls[0][0].where).toMatchObject({ userId: 'u1', createdAt: { gte: new Date('2026-10-01T00:00:00Z'), lt: new Date('2026-11-01T00:00:00Z') } })
    expect(await buildPayoutStatement({ commission: { groupBy } } as never, 'u1', 'nope')).toBeNull()
  })
})
