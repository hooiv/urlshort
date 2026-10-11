import { describe, expect, it, vi } from 'vitest'
import { commissionAfterRefund, commissionsToCsv, csvCell, scalarMetadata, transitionCommissions, applyRefundToCommission, canConfigureLink, type CommissionRow } from './commissions'

describe('commissionAfterRefund', () => {
  it('scales the commission down proportionally and floors', () => {
    expect(commissionAfterRefund(1000, 10_000, 0)).toBe(1000)
    expect(commissionAfterRefund(1000, 10_000, 2_500)).toBe(750)
    expect(commissionAfterRefund(333, 1000, 1)).toBe(332)
  })
  it('hits zero on a full refund and never goes negative or above the original', () => {
    expect(commissionAfterRefund(1000, 10_000, 10_000)).toBe(0)
    expect(commissionAfterRefund(1000, 10_000, 99_999)).toBe(0)
    expect(commissionAfterRefund(1000, 10_000, -5)).toBe(1000)
    expect(commissionAfterRefund(1000, 0, 0)).toBe(0)
  })
})

describe('scalarMetadata', () => {
  it('keeps scalars, drops objects, later sources win', () => {
    expect(scalarMetadata({ plan: 'basic', n: 3, nested: { a: 1 }, ok: true }, null, { plan: 'pro' })).toEqual({ plan: 'pro', n: '3', ok: 'true' })
  })
})

describe('csv', () => {
  it('defuses formulas and quotes separators', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)")
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell(null)).toBe('')
  })
  it('renders money and nets clawbacks', () => {
    const row: CommissionRow = { id: 'c1', conversionId: 'v1', shortCode: 'abc', saleValueCents: 4900, currency: 'USD', amountCents: 1000, clawbackCents: 250, status: 'paid', ruleId: null, scopeKey: 'account', createdAt: new Date('2026-01-02T03:04:05Z'), approvedAt: null, paidAt: null, payoutRef: '=cmd' }
    const lines = commissionsToCsv([row]).trim().split('\r\n')
    expect(lines).toHaveLength(2)
    expect(lines[1]).toBe("c1,abc,v1,49.00,USD,10.00,2.50,7.50,paid,,account,2026-01-02T03:04:05.000Z,,,'=cmd")
  })
})

describe('transitionCommissions', () => {
  it('guards on source status and owner', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 2 })
    const now = new Date('2026-02-01T00:00:00Z')
    const n = await transitionCommissions({ commission: { updateMany } } as never, 'u1', 'pay', ['a', 'b'], { payoutRef: 'wire-9', now })
    expect(n).toBe(2)
    expect(updateMany).toHaveBeenCalledWith({ where: { id: { in: ['a', 'b'] }, userId: 'u1', status: { in: ['approved'] } }, data: { status: 'paid', paidAt: now, payoutRef: 'wire-9' } })
  })
  it('does nothing for an empty id list', async () => {
    const updateMany = vi.fn()
    expect(await transitionCommissions({ commission: { updateMany } } as never, 'u1', 'approve', [])).toBe(0)
    expect(updateMany).not.toHaveBeenCalled()
  })
})

describe('applyRefundToCommission', () => {
  const base = { id: 'c', originalCents: 1000, saleValueCents: 10_000, amountCents: 1000, clawbackCents: 0 }
  const tx = (row: unknown) => ({ commission: { findUnique: vi.fn().mockResolvedValue(row), update: vi.fn().mockImplementation(async ({ data }) => ({ id: 'c', status: 'x', amountCents: 0, clawbackCents: 0, ...data })) } })
  it('shrinks a pending commission and reverses on a full refund', async () => {
    const t = tx({ ...base, status: 'pending' })
    await applyRefundToCommission(t as never, 'conv', 5_000)
    expect(t.commission.update).toHaveBeenCalledWith(expect.objectContaining({ data: { amountCents: 500, status: 'pending' } }))
    const full = tx({ ...base, status: 'approved' })
    await applyRefundToCommission(full as never, 'conv', 10_000)
    expect(full.commission.update).toHaveBeenCalledWith(expect.objectContaining({ data: { amountCents: 0, status: 'reversed' } }))
  })
  it('records a clawback instead of editing a paid commission', async () => {
    const t = tx({ ...base, status: 'paid' })
    await applyRefundToCommission(t as never, 'conv', 4_000)
    expect(t.commission.update).toHaveBeenCalledWith(expect.objectContaining({ data: { clawbackCents: 400 } }))
  })
  it('is a no-op without a commission', async () => {
    expect(await applyRefundToCommission(tx(null) as never, 'conv', 1)).toBeNull()
  })
})

describe('canConfigureLink', () => {
  it('allows owners and editors, rejects viewers and strangers', async () => {
    const db = (link: unknown, role?: string) => ({ url: { findUnique: vi.fn().mockResolvedValue(link) }, membership: { findUnique: vi.fn().mockResolvedValue(role ? { role } : null) } }) as never
    expect(await canConfigureLink(db({ userId: 'u', workspaceId: null }), 'u', 'x')).toBe(true)
    expect(await canConfigureLink(db({ userId: 'o', workspaceId: 'w' }, 'editor'), 'u', 'x')).toBe(true)
    expect(await canConfigureLink(db({ userId: 'o', workspaceId: 'w' }, 'viewer'), 'u', 'x')).toBe(false)
    expect(await canConfigureLink(db({ userId: 'o', workspaceId: null }), 'u', 'x')).toBe(false)
    expect(await canConfigureLink(db(null), 'u', 'x')).toBe(false)
  })
})
