import { createHash, randomUUID } from 'node:crypto'
import type { NextRequest } from 'next/server'

export type DeviceKind = 'mobile' | 'tablet' | 'desktop' | 'bot'
export type OperatingSystem = 'ios' | 'android' | 'macos' | 'windows' | 'linux' | 'chromeos' | 'other'
export type BrowserKind = 'chrome' | 'safari' | 'firefox' | 'edge' | 'opera' | 'samsung' | 'brave' | 'other'
export type TrafficChannel = 'direct' | 'social' | 'search' | 'email' | 'referral'
export type RouteHealth = 'unknown' | 'healthy' | 'degraded' | 'down'
export type TrafficKind = 'human' | 'ai_agent' | 'bot'

export type SmartRule = {
  id: string
  name?: string
  destinationUrl: string
  priority: number
  weight: number
  enabled: boolean
  healthStatus: RouteHealth
  countryCodes: string | null
  deviceType: DeviceKind | null
  trafficType?: TrafficKind | null
  aiAgent?: string | null
  os?: string | null
  languageCodes?: string | null
  referrerDomain: string | null
  startAt: Date | null
  endAt: Date | null
}

export function normalizeSafeUrl(input: string): string {
  let url: URL
  try { url = new URL(input.trim()) } catch { throw new Error('Enter a valid URL') }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS URLs are supported')
  if (url.username || url.password) throw new Error('Credential-bearing URLs are not allowed')
  return url.toString()
}

export function getCountry(request: NextRequest): string {
  const value = request.headers.get('cf-ipcountry') || request.headers.get('x-vercel-ip-country') || ''
  return /^[A-Za-z]{2}$/.test(value) ? value.toUpperCase() : 'XX'
}

export function getLanguage(request: NextRequest): string {
  const acceptLang = request.headers.get('accept-language') || ''
  const primary = acceptLang.split(',')[0]?.split(';')[0]?.trim().toLowerCase()
  if (!primary) return 'en'
  const lang = primary.split('-')[0]
  return /^[a-z]{2,3}$/.test(lang) ? lang : 'en'
}

export function getReferrerHost(request: NextRequest): string | null {
  const value = request.headers.get('referer')
  if (!value) return null
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, '') } catch { return null }
}

export function getDeviceType(userAgent: string | null): DeviceKind {
  const ua = (userAgent || '').toLowerCase()
  if (/bot|crawler|spider|slurp|facebookexternalhit|preview|headless|monitor/i.test(ua)) return 'bot'
  if (/ipad|tablet|playbook|silk|kindle|android(?!.*mobile)/i.test(ua)) return 'tablet'
  if (/mobi|iphone|ipod|android|windows phone/i.test(ua)) return 'mobile'
  return 'desktop'
}

export function getOperatingSystem(userAgent: string | null): OperatingSystem {
  const ua = (userAgent || '').toLowerCase()
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  if (/android/i.test(ua)) return 'android'
  if (/macintosh|mac os x/i.test(ua)) return 'macos'
  if (/windows nt|win32|win64/i.test(ua)) return 'windows'
  if (/cros/i.test(ua)) return 'chromeos'
  if (/linux/i.test(ua)) return 'linux'
  return 'other'
}

export function getBrowser(userAgent: string | null): BrowserKind {
  const ua = (userAgent || '').toLowerCase()
  if (/brave/i.test(ua)) return 'brave'
  if (/edg\//i.test(ua)) return 'edge'
  if (/samsungbrowser/i.test(ua)) return 'samsung'
  if (/opr\/|opera/i.test(ua)) return 'opera'
  if (/firefox|fxios/i.test(ua)) return 'firefox'
  if (/chrome|crios/i.test(ua)) return 'chrome'
  if (/safari/i.test(ua) && !/chrome|crios|android/i.test(ua)) return 'safari'
  return 'other'
}

const AI_AGENT_PATTERNS: Array<[RegExp, string]> = [
  [/GPTBot/i, 'openai'],
  [/OAI-SearchBot/i, 'openai-search'],
  [/ChatGPT-User/i, 'chatgpt-user'],
  [/ClaudeBot|Claude-Web/i, 'anthropic'],
  [/Claude-User/i, 'claude-user'],
  [/PerplexityBot/i, 'perplexity'],
  [/Google-Extended/i, 'google-ai'],
  [/GoogleOther/i, 'google-other'],
  [/Gemini/i, 'google-gemini'],
  [/Amazonbot/i, 'amazon'],
  [/Bytespider/i, 'bytedance'],
  [/CCBot/i, 'common-crawl'],
  [/cohere-ai/i, 'cohere'],
  [/YouBot/i, 'youcom'],
]

export function getAiAgent(userAgent: string | null): string | null {
  const ua = userAgent || ''
  for (const [pattern, name] of AI_AGENT_PATTERNS) if (pattern.test(ua)) return name
  return null
}

export function getTrafficConfidence(userAgent: string | null): number {
  const ua=(userAgent||'').toLowerCase(); if(!ua)return 0.25; if(getAiAgent(userAgent))return 0.99; let score=0.05; if(/bot|crawler|spider|slurp|headless|scrapy|python-requests|curl|wget/i.test(ua))score+=0.65; if(/mozilla\/5\\.0/i.test(ua))score-=0.15; if(/chrome|safari|firefox|edg\//i.test(ua))score-=0.15; return Math.max(0.01,Math.min(0.99,score))
}

export function getTrafficType(userAgent: string | null): TrafficKind {
  if (getAiAgent(userAgent)) return 'ai_agent'
  return getDeviceType(userAgent) === 'bot' ? 'bot' : 'human'
}

export interface TrafficSourceInfo {
  channel: TrafficChannel
  sourceName: string
  icon?: string
}

export function getTrafficSource(referrerHost: string | null): TrafficSourceInfo {
  if (!referrerHost) {
    return { channel: 'direct', sourceName: 'Direct / None' }
  }

  const host = referrerHost.toLowerCase().replace(/^www\./, '')

  // Webmail & email clients first
  if (/mail\.google\.com/i.test(host)) return { channel: 'email', sourceName: 'Gmail' }
  if (/outlook\.(live|office)\.com|mail\.live\.com/i.test(host)) return { channel: 'email', sourceName: 'Outlook' }
  if (/mail\.yahoo\.com/i.test(host)) return { channel: 'email', sourceName: 'Yahoo Mail' }

  // Social platforms
  if (/^(t\.co|twitter\.com|x\.com)$/i.test(host)) return { channel: 'social', sourceName: 'X (Twitter)' }
  if (/^(linkedin\.com|lnkd\.in)$/i.test(host)) return { channel: 'social', sourceName: 'LinkedIn' }
  if (/^(facebook\.com|fb\.com|m\.facebook\.com|l\.facebook\.com|lm\.facebook\.com)$/i.test(host)) return { channel: 'social', sourceName: 'Facebook' }
  if (/^(instagram\.com|l\.instagram\.com)$/i.test(host)) return { channel: 'social', sourceName: 'Instagram' }
  if (/^(tiktok\.com|vm\.tiktok\.com)$/i.test(host)) return { channel: 'social', sourceName: 'TikTok' }
  if (/^(reddit\.com|redd\.it|old\.reddit\.com)$/i.test(host)) return { channel: 'social', sourceName: 'Reddit' }
  if (/^(youtube\.com|youtu\.be)$/i.test(host)) return { channel: 'social', sourceName: 'YouTube' }
  if (/^(threads\.net)$/i.test(host)) return { channel: 'social', sourceName: 'Threads' }
  if (/^(pinterest\.com|pin\.it)$/i.test(host)) return { channel: 'social', sourceName: 'Pinterest' }
  if (/^(t\.me|telegram\.org)$/i.test(host)) return { channel: 'social', sourceName: 'Telegram' }
  if (/^(discord\.com|discord\.gg)$/i.test(host)) return { channel: 'social', sourceName: 'Discord' }

  // Search engines
  if (/google\./i.test(host)) return { channel: 'search', sourceName: 'Google' }
  if (/bing\.com/i.test(host)) return { channel: 'search', sourceName: 'Bing' }
  if (/duckduckgo\.com/i.test(host)) return { channel: 'search', sourceName: 'DuckDuckGo' }
  if (/yahoo\.com/i.test(host)) return { channel: 'search', sourceName: 'Yahoo' }
  if (/baidu\.com/i.test(host)) return { channel: 'search', sourceName: 'Baidu' }
  if (/yandex\./i.test(host)) return { channel: 'search', sourceName: 'Yandex' }
  if (/ecosia\.org/i.test(host)) return { channel: 'search', sourceName: 'Ecosia' }

  return { channel: 'referral', sourceName: host }
}

export function countryToFlag(code: string): string {
  if (!code || code === 'XX' || code.length !== 2) return '🌐'
  const upper = code.toUpperCase()
  const offset = 127397
  return String.fromCodePoint(upper.charCodeAt(0) + offset, upper.charCodeAt(1) + offset)
}

const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States', GB: 'United Kingdom', CA: 'Canada', DE: 'Germany',
  FR: 'France', IN: 'India', AU: 'Australia', BR: 'Brazil', JP: 'Japan',
  NL: 'Netherlands', ES: 'Spain', IT: 'Italy', SE: 'Sweden', SG: 'Singapore',
  MX: 'Mexico', ID: 'Indonesia', CH: 'Switzerland', BE: 'Belgium', AT: 'Austria',
  PL: 'Poland', DK: 'Denmark', NO: 'Norway', FI: 'Finland', IE: 'Ireland',
  NZ: 'New Zealand', ZA: 'South Africa', AR: 'Argentina', CL: 'Chile', CO: 'Colombia',
  KR: 'South Korea', TW: 'Taiwan', HK: 'Hong Kong', AE: 'United Arab Emirates',
  SA: 'Saudi Arabia', IL: 'Israel', PT: 'Portugal', TR: 'Turkey', PH: 'Philippines',
  MY: 'Malaysia', TH: 'Thailand', VN: 'Vietnam', PK: 'Pakistan', NG: 'Nigeria',
  EG: 'Egypt', RO: 'Romania', CZ: 'Czech Republic', HU: 'Hungary', GR: 'Greece',
  UA: 'Ukraine', XX: 'Unknown Location',
}

export function countryToName(code: string): string {
  if (!code || code === 'XX') return 'Unknown Location'
  return COUNTRY_NAMES[code.toUpperCase()] || code.toUpperCase()
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function getVisitorId(request: NextRequest): { id: string; isNew: boolean } {
  const existing = request.cookies.get('ql_visitor')?.value
  // The cookie is attacker-controlled. Only trust well-formed UUIDs; a
  // malformed value would otherwise poison sticky A/B bucketing and the
  // visitor hash used for attribution.
  if (existing && UUID_PATTERN.test(existing)) return { id: existing, isNew: false }
  return { id: randomUUID(), isNew: true }
}

function countryMatches(rule: SmartRule, country: string): boolean {
  if (!rule.countryCodes) return true
  return rule.countryCodes.split(/[\s,]+/).map((v) => v.trim().toUpperCase()).filter(Boolean).includes(country)
}

function osMatches(rule: SmartRule, os?: string): boolean {
  if (!rule.os) return true
  if (!os) return false
  return rule.os.split(/[\s,]+/).map((v) => v.trim().toLowerCase()).includes(os.toLowerCase())
}

function languageMatches(rule: SmartRule, language?: string): boolean {
  if (!rule.languageCodes) return true
  if (!language) return false
  return rule.languageCodes.split(/[\s,]+/).map((v) => v.trim().toLowerCase()).includes(language.toLowerCase())
}

function listMatches(ruleValue: string | null | undefined, actual: string | undefined): boolean {
  if (!ruleValue) return true
  if (!actual) return false
  const values = ruleValue.split(/[\s,]+/).map((v) => v.trim().toLowerCase()).filter(Boolean)
  return values.includes(actual.toLowerCase())
}

function referrerMatches(rule: SmartRule, host: string | null): boolean {
  if (!rule.referrerDomain) return true
  if (!host) return false
  const domain = rule.referrerDomain.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
  return host === domain || host.endsWith(`.${domain}`)
}

function timeMatches(rule: SmartRule, now: Date): boolean {
  if (rule.startAt && now < rule.startAt) return false
  if (rule.endAt && now > rule.endAt) return false
  return true
}

function stableBucket(seed: string, totalWeight: number): number {
  return createHash('sha256').update(seed).digest().readUInt32BE(0) % totalWeight
}

export interface RoutingContext {
  country: string
  deviceType: DeviceKind
  referrerHost: string | null
  now: Date
  os?: OperatingSystem
  language?: string
  trafficType?: TrafficKind
  aiAgent?: string | null
}

function matches(rule: SmartRule, context: RoutingContext): boolean {
  return (
    rule.enabled &&
    rule.healthStatus !== 'down' &&
    countryMatches(rule, context.country) &&
    (!rule.deviceType || rule.deviceType === context.deviceType) &&
    (!rule.trafficType || rule.trafficType === context.trafficType) &&
    listMatches(rule.aiAgent, context.aiAgent ?? undefined) &&
    listMatches(rule.os, context.os) &&
    osMatches(rule, context.os) &&
    languageMatches(rule, context.language) &&
    referrerMatches(rule, context.referrerHost) &&
    timeMatches(rule, context.now)
  )
}

export function chooseSmartRule(
  rules: SmartRule[],
  context: RoutingContext,
  shortCode: string,
  visitorId: string
): SmartRule | null {
  const candidates = rules.filter((rule) => matches(rule, context))
  if (!candidates.length) return null
  const firstPriority = Math.min(...candidates.map((rule) => rule.priority))
  const bucket = candidates.filter((rule) => rule.priority === firstPriority)
  const totalWeight = bucket.reduce((sum, rule) => sum + Math.max(0, rule.weight), 0)
  if (totalWeight <= 0) return bucket[0]
  const pick = stableBucket(`${shortCode}:${visitorId}:${firstPriority}`, totalWeight)
  let cursor = 0
  for (const rule of bucket) {
    cursor += Math.max(0, rule.weight)
    if (pick < cursor) return rule
  }
  return bucket[bucket.length - 1]
}

export function normalizeCountryCodes(input: unknown): string | null {
  if (input === undefined || input === null || input === '') return null
  const values = String(input).split(/[\s,]+/).map((v) => v.trim().toUpperCase()).filter(Boolean)
  if (values.some((v) => !/^[A-Z]{2}$/.test(v))) throw new Error('Countries must be ISO 2-letter codes')
  return [...new Set(values)].join(',')
}

export function normalizeReferrerDomain(input: unknown): string | null {
  if (input === undefined || input === null || input === '') return null
  const value = String(input).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
  if (!/^[a-z0-9.-]+$/.test(value) || !value.includes('.')) throw new Error('Enter a valid referrer domain')
  return value
}

export function normalizeList(input: unknown, allowed: Set<string>, label: string): string | null {
  if (input === undefined || input === null || input === '') return null
  const values = String(input).split(/[\s,]+/).map((v) => v.trim().toLowerCase()).filter(Boolean)
  if (values.some((v) => !allowed.has(v))) throw new Error(`${label} contains an unsupported value`)
  return [...new Set(values)].join(',')
}

export function parseOptionalDate(input: unknown): Date | null {
  if (input === undefined || input === null || input === '') return null
  const date = new Date(String(input))
  if (Number.isNaN(date.getTime())) throw new Error('Enter a valid date')
  return date
}
