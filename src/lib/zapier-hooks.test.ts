import { describe, expect, it, vi, beforeEach } from 'vitest'

const db = vi.hoisted(() => ({
  url: { findMany: vi.fn() },
  clickEvent: { findMany: vi.fn() },
  conversionEvent: { findMany: vi.fn() },
}))
vi.mock('./prisma', () => ({ prisma: db }))

import { eventForTrigger, isZapierTrigger, parsePollLimit, pollNewClicks, pollNewLinks, pollNewSales, pollTrigger } from './zapier-hooks'

describe('zapier hooks', () => {
  beforeEach(() => vi.clearAllMocks())

  it('maps trigger keys and raw events, rejecting everything else', () => {
    expect(eventForTrigger('new_sale')).toBe('conversion.recorded')
    expect(eventForTrigger(' new_link ')).toBe('link.created')
    expect(eventForTrigger('link.clicked')).toBe('link.clicked')
    expect(eventForTrigger('diagnostic.test')).toBeNull()
    expect(eventForTrigger(5)).toBeNull()
    expect(isZapierTrigger('toString')).toBe(false)
  })

  it('clamps poll limits', () => {
    expect(parsePollLimit(null)).toBe(25)
    expect(parsePollLimit('0')).toBe(25)
    expect(parsePollLimit('abc')).toBe(25)
    expect(parsePollLimit('7.9')).toBe(7)
    expect(parsePollLimit('9999')).toBe(100)
  })

  it('lists links newest first, scoped to what the user can see', async () => {
    db.url.findMany.mockResolvedValue([{ id: 'u1', shortCode: 'abc', originalUrl: 'https://e.com', title: null, createdAt: new Date('2026-01-02T00:00:00Z'), workspaceId: null, folderId: null }])
    const rows = await pollNewLinks('user1', 5)
    expect(rows[0]).toMatchObject({ id: 'u1', shortCode: 'abc', createdAt: '2026-01-02T00:00:00.000Z' })
    const args = db.url.findMany.mock.calls[0][0]
    expect(args.take).toBe(5)
    expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }])
    expect(JSON.stringify(args.where)).toContain('user1')
  })

  it('never exposes ip or user agent on clicks', async () => {
    db.clickEvent.findMany.mockResolvedValue([{ id: 'c1', createdAt: new Date(0), country: 'IN', city: null, deviceType: 'mobile', os: null, browser: null, referrerHost: null, utmSource: null, utmMedium: null, utmCampaign: null, url: { shortCode: 'abc', originalUrl: 'https://e.com' }, ip: '1.2.3.4', userAgent: 'x' }])
    const [row] = await pollNewClicks('u', 10)
    expect(row).not.toHaveProperty('ip')
    expect(row).not.toHaveProperty('userAgent')
    expect(db.clickEvent.findMany.mock.calls[0][0].where.trafficType).toBe('human')
    expect(row.shortCode).toBe('abc')
  })

  it('flattens sales with commission info', async () => {
    db.conversionEvent.findMany.mockResolvedValue([
      { id: 's1', valueCents: 5000, currency: 'usd', createdAt: new Date(0), goal: { name: 'Purchase' }, url: { shortCode: 'abc' }, commission: { amountCents: 500, status: 'pending' } },
      { id: 's2', valueCents: 100, currency: null, createdAt: new Date(0), goal: { name: 'Purchase' }, url: { shortCode: 'abc' }, commission: null },
    ])
    const rows = await pollNewSales('u', 10)
    expect(rows[0]).toMatchObject({ commissionCents: 500, commissionStatus: 'pending' })
    expect(rows[1]).toMatchObject({ commissionCents: null, commissionStatus: null })
    expect(db.conversionEvent.findMany.mock.calls[0][0].where.valueCents).toEqual({ not: null })
  })

  it('dispatches by trigger', async () => {
    db.url.findMany.mockResolvedValue([])
    expect(await pollTrigger('new_link', 'u', 1)).toEqual([])
    expect(db.url.findMany).toHaveBeenCalled()
  })
})
