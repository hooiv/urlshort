import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetGeoCacheForTests, resolveIpGeolocation } from './ip-geolocation'

describe('resolveIpGeolocation', () => {
  beforeEach(() => { __resetGeoCacheForTests(); process.env.IPINFO_TOKEN = 't' })
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); delete process.env.IPINFO_TOKEN })

  it('rejects invalid input without fetching', async () => {
    const f = vi.spyOn(globalThis, 'fetch')
    expect(await resolveIpGeolocation(null)).toBeNull()
    expect(await resolveIpGeolocation('nope')).toBeNull()
    expect(f).not.toHaveBeenCalled()
  })

  it('sanitises provider fields and caches the result', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ country: 'in', region: 'KA', city: 'Bengaluru' })))
    expect(await resolveIpGeolocation('8.8.8.8')).toEqual({ country: null, region: 'KA', city: 'Bengaluru' })
    await resolveIpGeolocation('8.8.8.8')
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('coalesces concurrent lookups for one IP', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ country: 'US' })))
    const r = await Promise.all([resolveIpGeolocation('1.1.1.1'), resolveIpGeolocation('1.1.1.1')])
    expect(r[0]?.country).toBe('US')
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('negative-caches failures briefly then retries', async () => {
    vi.useFakeTimers()
    const f = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('timeout'))
    expect(await resolveIpGeolocation('9.9.9.9')).toBeNull()
    expect(await resolveIpGeolocation('9.9.9.9')).toBeNull()
    expect(f).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(61_000)
    await resolveIpGeolocation('9.9.9.9')
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('skips lookups without a token', async () => {
    delete process.env.IPINFO_TOKEN
    const f = vi.spyOn(globalThis, 'fetch')
    expect(await resolveIpGeolocation('8.8.4.4')).toBeNull()
    expect(f).not.toHaveBeenCalled()
  })
})
