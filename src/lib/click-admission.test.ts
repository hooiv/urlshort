import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({ $transaction: vi.fn() }))
const leaseMock = vi.hoisted(() => vi.fn())
const releaseMock = vi.hoisted(() => vi.fn())
vi.mock('./prisma', () => ({ prisma: prismaMock }))
vi.mock('./tenant-usage', () => ({
  reserveUsageLeaseInTransaction: leaseMock,
  releaseUsage: releaseMock,
  usagePeriodKey: (date = new Date()) => date.toISOString().slice(0, 7),
}))

import { admitBillableClick, resetClickAdmissionForTests, returnAdmittedClick, sweepExpiredLeases } from './click-admission'

const grant = (granted: bigint, unlimited = false) => ({ unlimited, granted, limit: unlimited ? null : 1000n, used: 0n })

describe('click admission leases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetClickAdmissionForTests()
    prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({}))
    releaseMock.mockResolvedValue(undefined)
  })

  it('amortises one locked reservation over a whole lease', async () => {
    leaseMock.mockResolvedValue(grant(25n))
    const results = []
    for (let i = 0; i < 25; i++) results.push(await admitBillableClick('ws'))
    expect(results.every((r) => r.admitted && r.reserved)).toBe(true)
    expect(leaseMock).toHaveBeenCalledTimes(1)
    await admitBillableClick('ws')
    expect(leaseMock).toHaveBeenCalledTimes(2)
  })

  it('collapses concurrent misses into one acquisition', async () => {
    let resolve!: (v: unknown) => void
    leaseMock.mockReturnValueOnce(new Promise((r) => { resolve = r }))
    const pending = Array.from({ length: 10 }, () => admitBillableClick('ws'))
    resolve(grant(25n))
    const results = await Promise.all(pending)
    expect(results.filter((r) => r.admitted)).toHaveLength(10)
    expect(leaseMock).toHaveBeenCalledTimes(1)
  })

  it('sizes the next lease for callers already queued, so bursts are not rejected', async () => {
    let headroom = 100n
    leaseMock.mockImplementation(async (_tx, _ws, _metric, max: bigint, _div, _release, demand: bigint) => {
      let granted = demand > max ? max : demand
      if (granted > headroom) granted = headroom
      headroom -= granted
      return grant(granted)
    })
    const results = await Promise.all(Array.from({ length: 150 }, () => admitBillableClick('ws')))
    expect(results.filter((r) => r.admitted)).toHaveLength(100)
    expect(leaseMock.mock.calls.length).toBeLessThan(15)
  })

  it('never admits more than was granted', async () => {
    leaseMock.mockResolvedValueOnce(grant(3n)).mockResolvedValue(grant(0n))
    const results = await Promise.all(Array.from({ length: 8 }, () => admitBillableClick('ws')))
    expect(results.filter((r) => r.admitted)).toHaveLength(3)
  })

  it('rejects from memory once the tenant is exhausted', async () => {
    leaseMock.mockResolvedValue(grant(0n))
    expect(await admitBillableClick('ws')).toEqual({ admitted: false, reserved: false })
    expect(await admitBillableClick('ws')).toEqual({ admitted: false, reserved: false })
    expect(leaseMock).toHaveBeenCalledTimes(1)
  })

  it('lets unlimited tenants through without reserving', async () => {
    leaseMock.mockResolvedValue(grant(0n, true))
    expect(await admitBillableClick('ws')).toEqual({ admitted: true, reserved: false })
    expect(await admitBillableClick('ws')).toEqual({ admitted: true, reserved: false })
    expect(leaseMock).toHaveBeenCalledTimes(1)
  })

  it('hands leftovers back exactly once when a lease is renewed', async () => {
    leaseMock.mockResolvedValue(grant(10n))
    const realNow = Date.now
    try {
      await admitBillableClick('ws')
      Date.now = () => realNow() + 6_000
      await admitBillableClick('ws')
      expect(leaseMock.mock.calls[1][5]).toEqual({ periodKey: expect.any(String), amount: 9n })
      await sweepExpiredLeases(realNow() + 6_000)
      expect(releaseMock).not.toHaveBeenCalled()
    } finally {
      Date.now = realNow
    }
  })

  it('sweeps idle leases back to the bucket', async () => {
    leaseMock.mockResolvedValue(grant(10n))
    await admitBillableClick('ws')
    expect(await sweepExpiredLeases(Date.now() + 6_000)).toBe(1)
    expect(releaseMock).toHaveBeenCalledWith('ws', 'clicks', expect.any(String), 9n)
  })

  it('returns a unit the link cap refused', async () => {
    leaseMock.mockResolvedValue(grant(1n))
    await admitBillableClick('ws')
    returnAdmittedClick('ws')
    expect(await admitBillableClick('ws')).toEqual({ admitted: true, reserved: true })
    expect(leaseMock).toHaveBeenCalledTimes(1)
  })

  it('keeps owning units when the renewal transaction fails', async () => {
    const realNow = Date.now
    try {
      leaseMock.mockResolvedValueOnce(grant(5n))
      await admitBillableClick('ws')
      Date.now = () => realNow() + 6_000
      leaseMock.mockRejectedValueOnce(new Error('db down'))
      await expect(admitBillableClick('ws')).rejects.toThrow('db down')
      await sweepExpiredLeases(realNow() + 6_000)
      expect(releaseMock).toHaveBeenCalledWith('ws', 'clicks', expect.any(String), 4n)
    } finally {
      Date.now = realNow
    }
  })
})
