export type LinkOption = {
  id: string
  shortCode: string
  title: string | null
  originalUrl: string
  clicks: number
  healthStatus: string
}

export type Variant = {
  id: string
  name: string
  destinationUrl: string
  weight: number
  clicks: number
  conversions: number
  valueCents: string
  isControl: boolean
}

export type Decision = {
  id: string
  action: string
  reason: string
  confidenceBps: number | null
  oldWeightsJson: string | null
  newWeightsJson: string | null
  actorType: string
  createdAt: string
}

export type Anomaly = {
  id: string
  type: string
  severity: string
  metric: string
  baseline: number
  observed: number
  deviation: number
  startedAt: string
  resolvedAt: string | null
}

export type CampaignLink = {
  url: LinkOption
}

export type Campaign = {
  id: string
  name: string
  slug: string
  status: string
  objective: string
  currency: string
  autoOptimize: boolean
  confidenceThreshold: number
  minSampleSize: number
  minConversions: number
  maxTrafficShiftPercent: number
  version: number
  createdAt: string
  updatedAt: string
  variants: Variant[]
  decisions: Decision[]
  anomalies: Anomaly[]
  links: CampaignLink[]
}

export type CampaignAction = 'start' | 'autopilot' | 'pause'

export const objectiveLabels: Record<string, string> = {
  conversion_rate: 'Conversion rate',
  revenue_per_click: 'Revenue / click',
  revenue: 'Total revenue',
  conversion_value: 'Value / conversion',
}
