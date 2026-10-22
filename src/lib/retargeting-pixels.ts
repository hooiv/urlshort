/**
 * Retargeting pixels fired on redirect (Meta, Google, X, LinkedIn, TikTok, Pinterest, Snapchat, Reddit).
 *
 * Design:
 *  - IDs are validated per provider with strict patterns, so they can only
 *    ever be interpolated into markup/JS as inert literals.
 *  - Pixels fire only with consent: never when the visitor sends
 *    `Sec-GPC: 1` or `DNT: 1`, or has an explicit opt-out consent cookie.
 *  - No visible interstitial: the page redirects as soon as the tags have
 *    been dispatched, bounded by a hard cap (default 250ms) so a slow
 *    vendor script can never hold the visitor back.
 */

export type PixelProvider = 'meta' | 'google' | 'x' | 'linkedin' | 'tiktok' | 'pinterest' | 'snapchat' | 'reddit'

export interface PixelConfig {
  metaPixelId?: string | null
  googleTagId?: string | null
  xPixelId?: string | null
  linkedinPartnerId?: string | null
  tiktokPixelId?: string | null
  pinterestTagId?: string | null
  snapPixelId?: string | null
  redditPixelId?: string | null
}

const PATTERNS: Record<PixelProvider, RegExp> = {
  meta: /^\d{8,20}$/,
  // GA4 (G-), Google Ads (AW-), Floodlight (DC-), Universal (UA- legacy), GTM (GTM-)
  google: /^(G|AW|DC|GTM)-[A-Z0-9]{4,20}(\/[A-Za-z0-9_-]{1,40})?$/i,
  x: /^[a-z0-9]{4,12}$/i,
  linkedin: /^\d{4,12}$/,
  tiktok: /^[A-Z0-9]{10,30}$/i,
  pinterest: /^\d{10,16}$/,
  reddit: /^[a-z0-9_]{3,40}$/i,
  snapchat: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
}

const FIELD: Record<PixelProvider, keyof PixelConfig> = {
  meta: 'metaPixelId',
  google: 'googleTagId',
  x: 'xPixelId',
  linkedin: 'linkedinPartnerId',
  tiktok: 'tiktokPixelId',
  pinterest: 'pinterestTagId',
  snapchat: 'snapPixelId', reddit: 'redditPixelId',
}

export const PIXEL_PROVIDERS = Object.keys(PATTERNS) as PixelProvider[]

export function isValidPixelId(provider: PixelProvider, id: string): boolean {
  return PATTERNS[provider].test(id)
}

/** Returns the validated, trimmed id, null for empty input, or throws. */
export function normalizePixelId(provider: PixelProvider, raw: unknown): string | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw !== 'string') throw new PixelValidationError(provider, 'must be a string')
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (!isValidPixelId(provider, trimmed)) throw new PixelValidationError(provider, 'has an invalid format')
  return trimmed
}

export class PixelValidationError extends Error {
  constructor(public readonly provider: PixelProvider, reason: string) {
    super(`${FIELD[provider]} ${reason}`)
    this.name = 'PixelValidationError'
  }
}

/** Active (valid) pixels for a link. Invalid stored values are dropped, never rendered. */
export function activePixels(config: PixelConfig): Array<{ provider: PixelProvider; id: string }> {
  const out: Array<{ provider: PixelProvider; id: string }> = []
  for (const provider of PIXEL_PROVIDERS) {
    const value = config[FIELD[provider]]
    if (typeof value === 'string' && isValidPixelId(provider, value.trim())) {
      out.push({ provider, id: value.trim() })
    }
  }
  return out
}

export interface ConsentSignals {
  gpc?: string | null
  dnt?: string | null
  cookie?: string | null
}

/** Cookie `ql_consent=0|denied|reject` is an explicit opt-out. Absent consent cookie + no browser signal = allowed. */
export function pixelConsentGranted(signals: ConsentSignals): boolean {
  if (signals.gpc?.trim() === '1') return false
  if (signals.dnt?.trim() === '1') return false
  if (signals.cookie) {
    const match = /(?:^|;\s*)ql_consent=([^;]*)/.exec(signals.cookie)
    if (match && /^(0|denied|reject|false)$/i.test(decodeURIComponent(match[1]).trim())) return false
  }
  return true
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** JSON literal safe inside an inline <script> block. */
export function scriptLiteral(value: string): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
}

function snippet(provider: PixelProvider, id: string): string {
  const lit = scriptLiteral(id)
  switch (provider) {
    case 'meta':
      return `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init',${lit});fbq('track','PageView');`
    case 'google':
      return `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config',${lit});(function(){var s=document.createElement('script');s.async=!0;s.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(${lit});document.head.appendChild(s)})();`
    case 'x':
      return `!function(e,t,n,s,u,a){e.twq||(s=e.twq=function(){s.exe?s.exe.apply(s,arguments):s.queue.push(arguments)},s.version='1.1',s.queue=[],u=t.createElement(n),u.async=!0,u.src='https://static.ads-twitter.com/uwt.js',a=t.getElementsByTagName(n)[0],a.parentNode.insertBefore(u,a))}(window,document,'script');twq('config',${lit});`
    case 'linkedin':
      return `window._linkedin_data_partner_ids=window._linkedin_data_partner_ids||[];window._linkedin_data_partner_ids.push(${lit});(function(){var s=document.createElement('script');s.async=!0;s.src='https://snap.licdn.com/li.lms-analytics/insight.min.js';document.head.appendChild(s)})();`
    case 'tiktok':
      return `!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=['page','track','identify','instances','debug','on','off','once','ready','alias','group','enableCookie','disableCookie'];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.load=function(e){var n='https://analytics.tiktok.com/i18n/pixel/events.js';ttq._i=ttq._i||{};ttq._i[e]=[];ttq._t=ttq._t||{};ttq._t[e]=+new Date;var o=d.createElement('script');o.async=!0;o.src=n+'?sdkid='+e+'&lib='+t;var a=d.getElementsByTagName('script')[0];a.parentNode.insertBefore(o,a)};ttq.load(${lit});ttq.page()}(window,document,'ttq');`
    case 'pinterest':
      return `!function(e){if(!window.pintrk){window.pintrk=function(){window.pintrk.queue.push(Array.prototype.slice.call(arguments))};var n=window.pintrk;n.queue=[],n.version='3.0';var t=document.createElement('script');t.async=!0,t.src=e;var r=document.getElementsByTagName('script')[0];r.parentNode.insertBefore(t,r)}}('https://s.pinimg.com/ct/core.js');pintrk('load',${lit});pintrk('page');`
    case 'reddit':
      return `!function(w,d){if(!w.rdt){var p=w.rdt=function(){p.sendEvent?p.sendEvent.apply(p,arguments):p.callQueue.push(arguments)};p.callQueue=[];var t=d.createElement('script');t.src='https://www.redditstatic.com/ads/pixel.js';t.async=!0;var s=d.getElementsByTagName('script')[0];s.parentNode.insertBefore(t,s)}}(window,document);rdt('init',${lit});rdt('track','PageVisit');`
    case 'snapchat':
      return `(function(e,t,n){if(e.snaptr)return;var a=e.snaptr=function(){a.handleRequest?a.handleRequest.apply(a,arguments):a.queue.push(arguments)};a.queue=[];var s='script',r=t.createElement(s);r.async=!0;r.src=n;var u=t.getElementsByTagName(s)[0];u.parentNode.insertBefore(r,u)})(window,document,'https://sc-static.net/scevent.min.js');snaptr('init',${lit});snaptr('track','PAGE_VIEW');`
  }
}

export interface PixelPageOptions {
  destination: string
  pixels: Array<{ provider: PixelProvider; id: string }>
  /** Hard cap before redirecting regardless of vendor script state. */
  maxWaitMs?: number
}

export const DEFAULT_PIXEL_MAX_WAIT_MS = 250

/** Hosts the pixel page may load scripts/images from (for CSP). */
export const PIXEL_SCRIPT_HOSTS = [
  'https://connect.facebook.net',
  'https://www.googletagmanager.com',
  'https://static.ads-twitter.com',
  'https://snap.licdn.com',
  'https://analytics.tiktok.com',
  'https://s.pinimg.com',
  'https://sc-static.net',
  'https://www.redditstatic.com',
]

export function pixelContentSecurityPolicy(): string {
  const hosts = PIXEL_SCRIPT_HOSTS.join(' ')
  return `default-src 'none'; script-src 'unsafe-inline' ${hosts}; img-src https: data:; connect-src https:; base-uri 'none'; form-action 'none'`
}

/**
 * Minimal, invisible redirect page. Dispatches the tags, then navigates after
 * `maxWaitMs` — it does not wait on third-party script load events.
 */
export function renderPixelRedirectPage(opts: PixelPageOptions): string {
  const wait = Math.max(0, Math.min(opts.maxWaitMs ?? DEFAULT_PIXEL_MAX_WAIT_MS, 1000))
  const dest = esc(opts.destination)
  const tags = opts.pixels.map((p) => `try{${snippet(p.provider, p.id)}}catch(e){}`).join('')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="referrer" content="origin"><meta name="robots" content="noindex"><title></title><noscript><meta http-equiv="refresh" content="0; url=${dest}"></noscript><style>html,body{background:#fff;margin:0}</style></head><body><script>${tags}var go=function(){location.replace(${scriptLiteral(opts.destination)})};setTimeout(go,${wait});</script></body></html>`
}
