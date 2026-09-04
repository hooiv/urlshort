export interface UtmFields {
  utmSource: string
  utmMedium: string
  utmCampaign: string
  utmTerm: string
  utmContent: string
}

export interface SplitRuleInput {
  id: number
  url: string
  weight: number
}

export interface ShortenFormState extends UtmFields {
  url: string
  customCode: string
  title: string
  description: string
  ogImage: string
  tags: string
  password: string
  expiresAt: string
  expiredUrl: string
  maxClicks: string
  metaPixelId: string
  googleTagId: string
  xPixelId: string
  cloaked: boolean
  splitRules: SplitRuleInput[]
}

/** Only http(s) destinations (or schemeless hostnames that become https) are allowed. */
export function isSafeHttpUrl(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  const lower = trimmed.toLowerCase()
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('file:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('blob:')
  ) {
    return false
  }
  try {
    const candidate = trimmed.includes('://') ? trimmed : `https://${trimmed}`
    const parsed = new URL(candidate)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export function withUtmParams(baseUrl: string, utm: UtmFields): string {
  const hasUtm = utm.utmSource || utm.utmMedium || utm.utmCampaign || utm.utmTerm || utm.utmContent
  if (!baseUrl || !hasUtm) return baseUrl
  try {
    const u = new URL(baseUrl.includes('://') ? baseUrl : `https://${baseUrl}`)
    if (utm.utmSource.trim()) u.searchParams.set('utm_source', utm.utmSource.trim())
    if (utm.utmMedium.trim()) u.searchParams.set('utm_medium', utm.utmMedium.trim())
    if (utm.utmCampaign.trim()) u.searchParams.set('utm_campaign', utm.utmCampaign.trim())
    if (utm.utmTerm.trim()) u.searchParams.set('utm_term', utm.utmTerm.trim())
    if (utm.utmContent.trim()) u.searchParams.set('utm_content', utm.utmContent.trim())
    return u.toString()
  } catch {
    return baseUrl
  }
}

export function parseTagsInput(tags: string): string[] {
  return tags
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

export function parseMaxClicks(raw: string): number | undefined {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  const parsed = Number.parseInt(trimmed, 10)
  if (!Number.isInteger(parsed) || parsed < 1) return undefined
  return parsed
}

export function isFutureExpiresAt(value: string): boolean {
  if (!value) return true
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return false
  return parsed > Date.now()
}

export function normalizeSplitRules(rules: SplitRuleInput[]): Array<{ url: string; weight: number }> {
  return rules
    .filter((rule) => rule.url.trim().length > 0)
    .map((rule) => ({ url: rule.url.trim(), weight: rule.weight }))
}

/** Client-side validation mirroring POST /api/shorten. Returns an error message or null. */
export function validateShortenInput(form: ShortenFormState): string | null {
  if (!form.url.trim()) return 'Enter a destination URL'
  if (!isSafeHttpUrl(form.url.trim())) return 'Destination must be an http(s) URL'
  if (form.expiredUrl.trim() && !isSafeHttpUrl(form.expiredUrl.trim())) {
    return 'Expiration redirect must be an http(s) URL'
  }
  if (form.ogImage.trim() && !isSafeHttpUrl(form.ogImage.trim())) {
    return 'Social card image must be an http(s) URL'
  }
  if (form.maxClicks.trim()) {
    const parsed = Number.parseInt(form.maxClicks.trim(), 10)
    if (!Number.isInteger(parsed) || parsed < 1) return 'Max clicks must be a positive integer'
  }
  if (form.expiresAt && !isFutureExpiresAt(form.expiresAt)) {
    return 'Expiration date must be in the future'
  }
  for (const rule of form.splitRules) {
    if (!rule.url.trim()) continue
    if (!isSafeHttpUrl(rule.url.trim())) return 'A/B variant destinations must be http(s) URLs'
    if (!Number.isInteger(rule.weight) || rule.weight < 0 || rule.weight > 1000) {
      return 'A/B variant weight must be an integer from 0 to 1000'
    }
  }
  return null
}

export interface ShortenPayload {
  url: string
  customCode?: string
  title?: string
  description?: string
  ogImage?: string
  tags: string[]
  password?: string
  expiresAt?: string
  expiredUrl?: string
  maxClicks?: number
  metaPixelId?: string
  googleTagId?: string
  xPixelId?: string
  cloaked: boolean
  splitRules: Array<{ url: string; weight: number }>
}

/** Build the exact POST /api/shorten body. Callers must run validateShortenInput first. */
export function buildShortenPayload(form: ShortenFormState): ShortenPayload {
  const finalUrl = withUtmParams(form.url.trim(), form)
  return {
    url: finalUrl,
    customCode: form.customCode.trim() || undefined,
    title: form.title.trim() || undefined,
    description: form.description.trim() || undefined,
    ogImage: form.ogImage.trim() || undefined,
    tags: parseTagsInput(form.tags),
    password: form.password || undefined,
    expiresAt: form.expiresAt || undefined,
    expiredUrl: form.expiredUrl.trim() || undefined,
    maxClicks: parseMaxClicks(form.maxClicks),
    metaPixelId: form.metaPixelId.trim() || undefined,
    googleTagId: form.googleTagId.trim() || undefined,
    xPixelId: form.xPixelId.trim() || undefined,
    cloaked: form.cloaked,
    splitRules: normalizeSplitRules(form.splitRules),
  }
}

export function emptyShortenForm(): ShortenFormState {
  return {
    url: '',
    customCode: '',
    title: '',
    description: '',
    ogImage: '',
    tags: '',
    password: '',
    expiresAt: '',
    expiredUrl: '',
    maxClicks: '',
    metaPixelId: '',
    googleTagId: '',
    xPixelId: '',
    cloaked: false,
    splitRules: [],
    utmSource: '',
    utmMedium: '',
    utmCampaign: '',
    utmTerm: '',
    utmContent: '',
  }
}
