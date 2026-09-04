import { describe, expect, it } from 'vitest'
import {
  buildDeepLinkResolverUrl,
  isSafeDeepLinkTarget,
  pickDeepLinkFallback,
  shouldAutoOpenNative,
} from './deeplink-logic'

describe('buildDeepLinkResolverUrl', () => {
  it('encodes the short code as a path segment', () => {
    expect(buildDeepLinkResolverUrl('abc')).toBe('/api/deep-links/resolve/abc')
    expect(buildDeepLinkResolverUrl('a/b')).toBe('/api/deep-links/resolve/a%2Fb')
  })
})

describe('isSafeDeepLinkTarget', () => {
  it('allows http(s), relative, and app-scheme targets', () => {
    expect(isSafeDeepLinkTarget('https://example.com')).toBe(true)
    expect(isSafeDeepLinkTarget('/')).toBe(true)
    expect(isSafeDeepLinkTarget('/web/fallback')).toBe(true)
    expect(isSafeDeepLinkTarget('myapp://open/abc')).toBe(true)
  })

  it('blocks scriptable schemes and protocol-relative urls', () => {
    expect(isSafeDeepLinkTarget('javascript:alert(1)')).toBe(false)
    expect(isSafeDeepLinkTarget('data:text/html,hi')).toBe(false)
    expect(isSafeDeepLinkTarget('vbscript:msgbox(1)')).toBe(false)
    expect(isSafeDeepLinkTarget('//evil.example')).toBe(false)
    expect(isSafeDeepLinkTarget('')).toBe(false)
    expect(isSafeDeepLinkTarget(undefined)).toBe(false)
  })
})

describe('pickDeepLinkFallback', () => {
  it('prefers native/store urls and falls back to web or root', () => {
    expect(pickDeepLinkFallback({ url: 'myapp://open/1', webUrl: 'https://w.example', storeUrl: 'https://s.example' })).toEqual({
      openHref: 'myapp://open/1',
      storeHref: 'https://s.example',
      webHref: 'https://w.example',
    })
    expect(pickDeepLinkFallback({ url: 'javascript:alert(1)', webUrl: 'https://w.example' })).toEqual({
      openHref: 'https://w.example',
      storeHref: 'https://w.example',
      webHref: 'https://w.example',
    })
    expect(pickDeepLinkFallback({})).toEqual({ openHref: '/', storeHref: '/', webHref: '/' })
  })
})

describe('shouldAutoOpenNative', () => {
  it('auto-opens only explicit open actions with safe urls', () => {
    expect(shouldAutoOpenNative({ action: 'open', url: 'myapp://open/1' })).toBe(true)
    expect(shouldAutoOpenNative({ action: 'open', url: 'javascript:alert(1)' })).toBe(false)
    expect(shouldAutoOpenNative({ action: 'web', url: 'https://w.example' })).toBe(false)
  })
})
