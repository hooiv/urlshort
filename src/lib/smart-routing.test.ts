import { describe, expect, it } from 'vitest'
import type { NextRequest } from 'next/server'
import {
  chooseSmartRule,
  countryToFlag,
  countryToName,
  getBrowser,
  getAiAgent,
  getDeviceType,
  getOperatingSystem,
  getTrafficSource,
  getTrafficType,
  getVisitorId,
  normalizeCountryCodes,
  normalizeReferrerDomain,
  normalizeSafeUrl,
  type SmartRule,
} from './smart-routing'

function rule(overrides: Partial<SmartRule> = {}): SmartRule {
  return {
    id: 'r1',
    destinationUrl: 'https://example.com/r1',
    priority: 100,
    weight: 100,
    enabled: true,
    healthStatus: 'unknown',
    countryCodes: null,
    deviceType: null,
    trafficType: null,
    aiAgent: null,
    os: null,
    languageCodes: null,
    referrerDomain: null,
    startAt: null,
    endAt: null,
    ...overrides,
  }
}

const context = { country: 'US', deviceType: 'desktop' as const, referrerHost: null, now: new Date('2026-01-01T00:00:00Z') }

describe('chooseSmartRule', () => {
  it('returns null when no rules match', () => {
    const result = chooseSmartRule([rule({ enabled: false })], context, 'abc', 'v1')
    expect(result).toBeNull()
  })

  it('returns null for an empty rule set', () => {
    expect(chooseSmartRule([], context, 'abc', 'v1')).toBeNull()
  })

  it('skips down rules even at the best priority', () => {
    const healthy = rule({ id: 'healthy', healthStatus: 'healthy' })
    const down = rule({ id: 'down', healthStatus: 'down' })
    const result = chooseSmartRule([down, healthy], context, 'abc', 'v1')
    expect(result?.id).toBe('healthy')
  })

  it('prefers the lowest priority tier regardless of order', () => {
    const high = rule({ id: 'high', priority: 200 })
    const low = rule({ id: 'low', priority: 10 })
    const result = chooseSmartRule([high, low], context, 'abc', 'v1')
    expect(result?.id).toBe('low')
  })

  it('is sticky per visitor (deterministic assignment)', () => {
    const a = rule({ id: 'a', weight: 50 })
    const b = rule({ id: 'b', weight: 50 })
    const first = chooseSmartRule([a, b], context, 'abc', 'visitor-42')
    for (let i = 0; i < 20; i += 1) {
      expect(chooseSmartRule([a, b], context, 'abc', 'visitor-42')?.id).toBe(first?.id)
    }
  })

  it('splits traffic between equal-weight variants across visitors', () => {
    const a = rule({ id: 'a', weight: 50 })
    const b = rule({ id: 'b', weight: 50 })
    const picks = new Set<string>()
    for (let i = 0; i < 200; i += 1) {
      const picked = chooseSmartRule([a, b], context, 'abc', `visitor-${i}`)
      if (picked) picks.add(picked.id)
    }
    expect(picks.size).toBe(2)
  })

  it('respects a zero-weight variant (never picked)', () => {
    const active = rule({ id: 'active', weight: 100 })
    const zero = rule({ id: 'zero', weight: 0 })
    for (let i = 0; i < 100; i += 1) {
      expect(chooseSmartRule([active, zero], context, 'abc', `visitor-${i}`)?.id).toBe('active')
    }
  })

  it('filters by country when specified', () => {
    const usOnly = rule({ countryCodes: 'US' })
    expect(chooseSmartRule([usOnly], { ...context, country: 'GB' }, 'abc', 'v1')).toBeNull()
    expect(chooseSmartRule([usOnly], { ...context, country: 'US' }, 'abc', 'v1')?.id).toBe('r1')
  })

  it('filters by device type', () => {
    const mobileOnly = rule({ deviceType: 'mobile' })
    expect(chooseSmartRule([mobileOnly], { ...context, deviceType: 'desktop' }, 'abc', 'v1')).toBeNull()
    expect(chooseSmartRule([mobileOnly], { ...context, deviceType: 'mobile' }, 'abc', 'v1')?.id).toBe('r1')
  })

  it('filters by OS', () => {
    const iosRule = rule({ os: 'ios' })
    expect(chooseSmartRule([iosRule], { ...context, os: 'android' }, 'abc', 'v1')).toBeNull()
    expect(chooseSmartRule([iosRule], { ...context, os: 'ios' }, 'abc', 'v1')?.id).toBe('r1')
  })

  it('routes AI agents independently from ordinary bots', () => {
    const ai = rule({ trafficType: 'ai_agent', aiAgent: 'openai' })
    expect(chooseSmartRule([ai], { ...context, trafficType: 'ai_agent', aiAgent: 'openai' }, 'abc', 'v1')?.id).toBe('r1')
    expect(chooseSmartRule([ai], { ...context, trafficType: 'bot', aiAgent: null }, 'abc', 'v1')).toBeNull()
    expect(chooseSmartRule([ai], { ...context, trafficType: 'ai_agent', aiAgent: 'perplexity' }, 'abc', 'v1')).toBeNull()
  })

  it('filters by language', () => {
    const spanishRule = rule({ languageCodes: 'es' })
    expect(chooseSmartRule([spanishRule], { ...context, language: 'en' }, 'abc', 'v1')).toBeNull()
    expect(chooseSmartRule([spanishRule], { ...context, language: 'es' }, 'abc', 'v1')?.id).toBe('r1')
  })

  it('matches subdomain referrers but not substring hosts', () => {
    const social = rule({ referrerDomain: 'instagram.com' })
    expect(chooseSmartRule([social], { ...context, referrerHost: 'www.instagram.com' }, 'abc', 'v1')?.id).toBe('r1')
    expect(chooseSmartRule([social], { ...context, referrerHost: 'notinstagram.com' }, 'abc', 'v1')).toBeNull()
    expect(chooseSmartRule([social], { ...context, referrerHost: null }, 'abc', 'v1')).toBeNull()
  })

  it('honors time windows', () => {
    const scheduled = rule({ startAt: new Date('2026-06-01T00:00:00Z') })
    expect(chooseSmartRule([scheduled], context, 'abc', 'v1')).toBeNull()
    expect(chooseSmartRule([scheduled], { ...context, now: new Date('2026-07-01T00:00:00Z') }, 'abc', 'v1')?.id).toBe('r1')
  })
})

describe('getOperatingSystem', () => {
  it('identifies iOS', () => {
    expect(getOperatingSystem('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)')).toBe('ios')
    expect(getOperatingSystem('Mozilla/5.0 (iPad; CPU OS 16_5 like Mac OS X)')).toBe('ios')
  })
  it('identifies Android', () => {
    expect(getOperatingSystem('Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro)')).toBe('android')
  })
  it('identifies macOS', () => {
    expect(getOperatingSystem('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('macos')
  })
  it('identifies Windows', () => {
    expect(getOperatingSystem('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows')
  })
  it('identifies Linux', () => {
    expect(getOperatingSystem('Mozilla/5.0 (X11; Linux x86_64)')).toBe('linux')
  })
})

describe('getBrowser', () => {
  it('identifies Chrome', () => {
    expect(getBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36')).toBe('chrome')
  })
  it('identifies Safari', () => {
    expect(getBrowser('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15')).toBe('safari')
  })
  it('identifies Firefox', () => {
    expect(getBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0')).toBe('firefox')
  })
  it('identifies Edge', () => {
    expect(getBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0')).toBe('edge')
  })
})

describe('AI traffic classification', () => {
  it('recognizes major AI agents', () => {
    expect(getAiAgent('Mozilla/5.0 GPTBot/1.2')).toBe('openai')
    expect(getAiAgent('Mozilla/5.0 ClaudeBot/1.0')).toBe('anthropic')
    expect(getAiAgent('PerplexityBot/1.0')).toBe('perplexity')
    expect(getAiAgent('Google-Extended')).toBe('google-ai')
    expect(getAiAgent('Mozilla/5.0 Chrome/120.0')).toBeNull()
  })

  it('classifies AI agents before the generic bot detector', () => {
    expect(getTrafficType('GPTBot/1.0')).toBe('ai_agent')
    expect(getTrafficType('Googlebot/2.1')).toBe('bot')
    expect(getTrafficType('Mozilla/5.0 Chrome/120.0')).toBe('human')
  })
})

describe('getTrafficSource', () => {
  it('categorizes direct traffic', () => {
    expect(getTrafficSource(null).channel).toBe('direct')
  })
  it('categorizes social networks', () => {
    expect(getTrafficSource('t.co')).toEqual({ channel: 'social', sourceName: 'X (Twitter)' })
    expect(getTrafficSource('l.instagram.com')).toEqual({ channel: 'social', sourceName: 'Instagram' })
    expect(getTrafficSource('linkedin.com')).toEqual({ channel: 'social', sourceName: 'LinkedIn' })
    expect(getTrafficSource('reddit.com')).toEqual({ channel: 'social', sourceName: 'Reddit' })
    expect(getTrafficSource('tiktok.com')).toEqual({ channel: 'social', sourceName: 'TikTok' })
  })
  it('categorizes search engines', () => {
    expect(getTrafficSource('google.com')).toEqual({ channel: 'search', sourceName: 'Google' })
    expect(getTrafficSource('bing.com')).toEqual({ channel: 'search', sourceName: 'Bing' })
    expect(getTrafficSource('duckduckgo.com')).toEqual({ channel: 'search', sourceName: 'DuckDuckGo' })
  })
  it('categorizes email clients', () => {
    expect(getTrafficSource('mail.google.com')).toEqual({ channel: 'email', sourceName: 'Gmail' })
    expect(getTrafficSource('outlook.live.com')).toEqual({ channel: 'email', sourceName: 'Outlook' })
  })
})

describe('country helpers', () => {
  it('generates emoji flags from ISO codes', () => {
    expect(countryToFlag('US')).toBe('🇺🇸')
    expect(countryToFlag('GB')).toBe('🇬🇧')
    expect(countryToFlag('IN')).toBe('🇮🇳')
    expect(countryToFlag('DE')).toBe('🇩🇪')
    expect(countryToFlag('XX')).toBe('🌐')
  })
  it('resolves country names', () => {
    expect(countryToName('US')).toBe('United States')
    expect(countryToName('GB')).toBe('United Kingdom')
    expect(countryToName('IN')).toBe('India')
    expect(countryToName('XX')).toBe('Unknown Location')
  })
})

describe('getDeviceType', () => {
  it('classifies common user agents', () => {
    expect(getDeviceType('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe('mobile')
    expect(getDeviceType('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe('tablet')
    expect(getDeviceType('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('desktop')
    expect(getDeviceType('Googlebot/2.1 (+http://www.google.com/bot.html)')).toBe('bot')
    expect(getDeviceType(null)).toBe('desktop')
  })
})

describe('normalizeCountryCodes', () => {
  it('normalizes and dedupes codes', () => {
    expect(normalizeCountryCodes('us, gb ,US')).toBe('US,GB')
    expect(normalizeCountryCodes('')).toBeNull()
    expect(normalizeCountryCodes(null)).toBeNull()
  })

  it('rejects invalid codes', () => {
    expect(() => normalizeCountryCodes('USA')).toThrow()
    expect(() => normalizeCountryCodes('12')).toThrow()
  })
})

describe('normalizeReferrerDomain', () => {
  it('strips protocol and www', () => {
    expect(normalizeReferrerDomain('https://www.Instagram.com/f/')).toBe('instagram.com')
  })

  it('rejects garbage', () => {
    expect(() => normalizeReferrerDomain('not a domain')).toThrow()
  })
})

describe('normalizeSafeUrl', () => {
  it('accepts normal https URLs', () => {
    expect(normalizeSafeUrl('https://example.com/path')).toBe('https://example.com/path')
  })

  it('rejects non-http protocols and credential-bearing URLs', () => {
    expect(() => normalizeSafeUrl('javascript:alert(1)')).toThrow()
    expect(() => normalizeSafeUrl('https://user:pass@example.com')).toThrow()
    expect(() => normalizeSafeUrl('not a url')).toThrow()
  })
})

describe('getVisitorId', () => {
  const stub = (value: string | undefined) =>
    ({ cookies: { get: () => (value === undefined ? undefined : { value }) } }) as unknown as NextRequest

  it('passes through well-formed visitor cookies', () => {
    const id = '123e4567-e89b-12d3-a456-426614174000'
    expect(getVisitorId(stub(id))).toEqual({ id, isNew: false })
  })

  it('regenerates attacker-controlled or malformed cookie values', () => {
    for (const bad of ['attacker-controlled', '../../etc/passwd', '', '123e4567-e89b-12d3-a456', 'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz']) {
      const result = getVisitorId(stub(bad))
      expect(result.isNew).toBe(true)
      expect(result.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
      expect(result.id).not.toBe(bad)
    }
  })

  it('mints a fresh id when no cookie is present', () => {
    const result = getVisitorId(stub(undefined))
    expect(result.isNew).toBe(true)
    expect(result.id).toMatch(/^[0-9a-f-]{36}$/)
  })
})
