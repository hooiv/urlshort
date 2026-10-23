import { describe, expect, it } from 'vitest'
import { foldForecast, type ForecastRow } from './commission-forecast'

const now = new Date('2026-10-23T00:00:00Z')
const day = (n: number) => new Date(now.getTime() + n * 86_400_000)
const row = (o: Partial<ForecastRow>): ForecastRow => ({ status: 'pending', amountCents: 100, clawbackCents: 0, currency: 'usd', holdUntil: null, ...o })
const get = (f: ReturnType<typeof foldForecast>, l: string) => f.buckets.find((b) => b.label === l)!

describe('foldForecast', () => {
  it('buckets pending by hold window boundaries', () => {
    const f = foldForecast([row({ holdUntil: day(-1) }), row({ holdUntil: null }), row({ holdUntil: day(7) }), row({ holdUntil: day(8) }), row({ holdUntil: day(30) }), row({ holdUntil: day(31) })], now, 'usd')
    expect(get(f, 'payable_now')).toMatchObject({ cents: 200, count: 2 })
    expect(get(f, 'releases_7d').count).toBe(1)
    expect(get(f, 'releases_30d').count).toBe(2)
    expect(get(f, 'releases_later').count).toBe(1)
    expect(f.netOwedCents).toBe(600)
  })
  it('counts approved separately, ignores paid/reversed amounts, nets clawbacks', () => {
    const f = foldForecast([row({ status: 'approved', amountCents: 500 }), row({ status: 'paid', amountCents: 999, clawbackCents: 150 }), row({ status: 'reversed', amountCents: 40 })], now, 'usd')
    expect(get(f, 'approved_unpaid').cents).toBe(500)
    expect(f.clawbackCents).toBe(150)
    expect(f.netOwedCents).toBe(350)
  })
  it('keeps currencies apart and never goes negative', () => {
    const rows = [row({ currency: 'EUR', amountCents: 10 }), row({ currency: null, amountCents: 20, clawbackCents: 500, status: 'paid' })]
    expect(foldForecast(rows, now, 'eur').netOwedCents).toBe(10)
    expect(foldForecast(rows, now, 'usd').netOwedCents).toBe(0)
  })
})
