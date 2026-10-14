import { describe, expect, it } from 'vitest'
import { buildChannelBreakdown, classifyReferrer, isQrMedium, parseChannelDays } from './referrer-channels'

describe('classifyReferrer', () => {
  it.each([
    [null, 'direct'], ['', 'direct'], ['www.google.com', 'search'], ['google.co.uk', 'search'], ['duckduckgo.com', 'search'],
    ['l.facebook.com', 'social'], ['t.co', 'social'], ['out.reddit.com', 'social'], ['youtu.be', 'social'],
    ['mail.google.com', 'email'], ['outlook.live.com', 'email'], ['foo.substack.com', 'email'],
    ['web.whatsapp.com', 'messaging'], ['t.me', 'messaging'], ['app.slack.com', 'messaging'],
    ['notfacebook.com', 'other'], ['example.org', 'other'],
  ])('%s -> %s', (host, expected) => { expect(classifyReferrer(host as string | null)).toBe(expected) })
})

describe('buildChannelBreakdown', () => {
  it('aggregates, ranks, shares and keeps top 3 hosts', () => {
    const r = buildChannelBreakdown([
      { host: 'google.com', clicks: 5 }, { host: 'www.google.com', clicks: 2 }, { host: 'bing.com', clicks: 1 },
      { host: 'duckduckgo.com', clicks: 1 }, { host: 'ecosia.org', clicks: 1 }, { host: null, clicks: 10 }, { host: 'x.com', clicks: 0 },
    ], 30)
    expect(r.total).toBe(20)
    expect(r.channels.map((c) => [c.channel, c.clicks, c.share])).toEqual([['search', 10, 50], ['direct', 10, 50]])
    expect(r.channels[0].topHosts).toHaveLength(3)
    expect(r.channels[0].topHosts[0]).toEqual({ host: 'google.com', clicks: 7 })
  })
  it('handles empty input', () => { expect(buildChannelBreakdown([], 7)).toEqual({ days: 7, total: 0, channels: [] }) })
})

describe('parseChannelDays', () => {
  it('validates', () => {
    expect(parseChannelDays(null)).toBe(30)
    expect(parseChannelDays('365')).toBe(365)
    expect(parseChannelDays('366')).toBeNull()
    expect(parseChannelDays('0')).toBeNull()
    expect(parseChannelDays('1e2')).toBeNull()
  })
})

describe('qr channel', () => {
  it('isQrMedium is case/space insensitive', () => {
    expect(isQrMedium(' QR ')).toBe(true)
    expect(isQrMedium('qrcode')).toBe(false)
    expect(isQrMedium(null)).toBe(false)
  })
  it('qr clicks win over referrer classification', () => {
    const r = buildChannelBreakdown([
      { host: null, clicks: 6, qr: true }, { host: 'google.com', clicks: 2, qr: true }, { host: 'google.com', clicks: 2 },
    ], 30)
    expect(r.channels.map((c) => [c.channel, c.clicks])).toEqual([['qr', 8], ['search', 2]])
  })
})
