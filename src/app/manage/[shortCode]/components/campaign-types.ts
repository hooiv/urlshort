export interface Rule {
  id: string
  name: string
  destinationUrl: string
  priority: number
  weight: number
  enabled: boolean
  countryCodes: string | null
  deviceType: string | null
  trafficType: string | null
  aiAgent: string | null
  os: string | null
  languageCodes: string | null
  referrerDomain: string | null
  startAt: string | null
  endAt: string | null
}

export interface Revision {
  id: string
  destinationUrl: string
  reason: string | null
  effectiveAt: string
}

export interface Form {
  name: string
  destinationUrl: string
  priority: string
  weight: string
  countryCodes: string
  deviceType: string
  trafficType: string
  aiAgent: string
  os: string
  languageCodes: string
  referrerDomain: string
  startAt: string
  endAt: string
}

export const emptyForm: Form = {
  name: '',
  destinationUrl: '',
  priority: '100',
  weight: '100',
  countryCodes: '',
  deviceType: '',
  trafficType: '',
  aiAgent: '',
  os: '',
  languageCodes: '',
  referrerDomain: '',
  startAt: '',
  endAt: '',
}

export type SocialPlatform = 'twitter' | 'facebook' | 'linkedin' | 'slack'

export interface WebhookTestResponse {
  success: boolean
  statusCode?: number
  error?: string
  latencyMs?: number
  responseBodySnippet?: string
}

export interface PreviewInput {
  country: string
  deviceType: string
  os: string
  language: string
  trafficType: string
  aiAgent: string
  referrerHost: string
}

export const emptyPreview: PreviewInput = {
  country: 'US',
  deviceType: 'desktop',
  os: 'windows',
  language: 'en',
  trafficType: 'human',
  aiAgent: '',
  referrerHost: '',
}

export interface PreviewResult {
  destination: string
  fallback: boolean
  matchedRule: { name: string } | null
}
