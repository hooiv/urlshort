import { describe, expect, it, vi } from 'vitest'
import { applyDailyHistory, fetchBitlyDailyClicks, normalizeBitlyClicks } from './click-history-import'

const now = new Date('2026-10-10T10:00:00Z')

describe('normalizeBitlyClicks', () => {
  it('merges same-day entries, sorts, and drops junk and future days', () => {
    const out = normalizeBitlyClicks([
      { date: '2026-10-02T00:00:00+0000', clicks: 3 },
      { date: '2026-10-01T00:00:00+0000', clicks: 2 },
      { date: '2026-10-02T12:00:00+0000', clicks: 4 },
      { date: '2026-10-01T00:00:00+0000', clicks: 0 },
      { date: 'nope', clicks: 5 },
      { date: '2026-10-03T00:00:00+0000', clicks: -1 },
      { date: '2027-01-01T00:00:00+0000', clicks: 9 },
      null,
    ], now)
    expect(out).toEqual([{ dateKey: '2026-10-01', clicks: 2 }, { dateKey: '2026-10-02', clicks: 7 }])
  })
  it('tolerates non-array input', () => expect(normalizeBitlyClicks({}, now)).toEqual([]))
})

describe('fetchBitlyDailyClicks', () => {
  it('sends the token and parses the series', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ link_clicks: [{ date: '2020-01-01T00:00:00+0000', clicks: 4 }] })))
    expect(await fetchBitlyDailyClicks('tok', 'bit.ly/abc', fetchImpl)).toEqual([{ dateKey: '2020-01-01', clicks: 4 }])
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/v4/bitlinks/bit.ly/abc/clicks?unit=day&units=365')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok')
  })
  it('rejects ids that could alter the path', async () => {
    await expect(fetchBitlyDailyClicks('t', 'bit.ly/../v4/user', vi.fn())).rejects.toThrow('Invalid bitlink')
  })
  it('maps auth and server errors', async () => {
    await expect(fetchBitlyDailyClicks('t', 'bit.ly/a', async () => new Response('', { status: 403 }))).rejects.toThrow('rejected the token')
    await expect(fetchBitlyDailyClicks('t', 'bit.ly/a', async () => new Response('', { status: 500 }))).rejects.toThrow('(500)')
  })
})

describe('applyDailyHistory', () => {
  const mk = (existing: string[], createdCount?: number) => {
    const createMany = vi.fn(async ({ data }: { data: unknown[] }) => ({ count: createdCount ?? data.length }))
    const update = vi.fn(async () => ({}))
    const db = { clickDaily: { findMany: vi.fn(async () => existing.map((dateKey) => ({ dateKey }))), createMany }, url: { update } }
    return { db: db as never, createMany, update }
  }
  const series = [{ dateKey: '2026-10-01', clicks: 2 }, { dateKey: '2026-10-02', clicks: 5 }]
  it('adds missing days and bumps the lifetime counter', async () => {
    const { db, update } = mk([])
    expect(await applyDailyHistory(db, 'u1', series)).toEqual({ added: 2, skipped: 0, clicks: 7 })
    expect(update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { clicks: { increment: 7 } } })
  })
  it('skips days that already have rows, so a rerun changes nothing', async () => {
    const { db, createMany, update } = mk(['2026-10-01', '2026-10-02'])
    expect(await applyDailyHistory(db, 'u1', series)).toEqual({ added: 0, skipped: 2, clicks: 0 })
    expect(createMany).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })
  it('does not bump the counter when a concurrent run won the race', async () => {
    const { db, update } = mk([], 0)
    expect((await applyDailyHistory(db, 'u1', series)).added).toBe(0)
    expect(update).not.toHaveBeenCalled()
  })
})

import { fetchShortIoDailyClicks, normalizeShortIoClicks } from './click-history-import'

describe('Short.io click import', () => {
  const now = new Date('2026-10-10T12:00:00Z')
  it('normalizes string counts, merges days, drops junk and future days', () => {
    const body = { clickStatistics: { datasets: [{ data: [{ x: '2026-10-01', y: '3' }, { x: '2026-10-01T05:00:00Z', y: 2 }, { x: '2026-10-02', y: '0' }, { x: 'bad', y: '4' }, { x: '2026-12-01', y: '9' }] }] } }
    expect(normalizeShortIoClicks(body, now)).toEqual([{ dateKey: '2026-10-01', clicks: 5 }])
    expect(normalizeShortIoClicks(null, now)).toEqual([])
  })
  it('calls the statistics API with the key and a one-year custom window', async () => {
    const calls: Array<[string, RequestInit | undefined]> = []
    const f = async (u: string, i?: RequestInit) => { calls.push([u, i]); return new Response(JSON.stringify({ clickStatistics: { datasets: [{ data: [{ x: '2026-10-03', y: '7' }] }] } })) }
    expect(await fetchShortIoDailyClicks('secret_key_123', 'lnk_abc123', f, now)).toEqual([{ dateKey: '2026-10-03', clicks: 7 }])
    expect(calls[0][0]).toContain('statistics.short.io/statistics/link/lnk_abc123?')
    expect(calls[0][0]).toContain('period=custom')
    expect((calls[0][1]?.headers as Record<string, string>).authorization).toBe('secret_key_123')
  })
  it('rejects bad ids and maps auth failures', async () => {
    await expect(fetchShortIoDailyClicks('secret_key_123', '../x', async () => new Response('{}'))).rejects.toThrow(/Invalid Short\.io/)
    await expect(fetchShortIoDailyClicks('secret_key_123', 'lnk_abc123', async () => new Response('', { status: 401 }))).rejects.toThrow(/rejected/)
  })
})
