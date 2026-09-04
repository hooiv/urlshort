import type { StatisticalResult } from '@/lib/stats'

export interface CountryStat {
  code: string
  name: string
  flag: string
  clicks: number
  percentage: number
}

export interface CityStat {
  city: string
  country: string
  name: string
  flag: string
  clicks: number
  percentage: number
}

export interface DeviceStat {
  device: string
  clicks: number
  percentage: number
}

export interface TechStat {
  os?: string
  browser?: string
  channel?: string
  name?: string
  clicks: number
  percentage: number
}

export interface ReferrerStat {
  host: string
  sourceName: string
  channel: string
  clicks: number
  percentage: number
}

export interface UtmStat {
  name: string
  clicks: number
  conversions: number
  conversionRate: number
  valueCents: number
}

export interface GoalStat {
  id: string
  name: string
  eventKey: string
  enabled: boolean
  conversions: number
  valueCents: number
}

export interface RulePerformance {
  id: string
  name: string
  destinationUrl: string
  priority: number
  weight: number
  enabled: boolean
  clicks: number
  conversions: number
  conversionRate: number
  valueCents: number
}

export interface RecentClick {
  id: string
  createdAt: string
  country: string
  countryName: string
  flag: string
  city: string | null
  referrer: string
  referrerSource: string
  channel: string
  deviceType: string
  os: string
  browser: string
  ruleId: string | null
}

export interface AnalyticsData {
  url: {
    id: string
    originalUrl: string
    shortCode: string
    title: string | null
    clicks: number
    createdAt: string
  }
  window: {
    from: string
    to: string
    range: string
    isHourly: boolean
  }
  filters: {
    country: string | null
    device: string | null
    referrer: string | null
    ruleId: string | null
  }
  analytics: {
    totalClicks: number
    windowClicks: number
    totalConversions: number
    totalValueCents: number
    conversionRate: number
    averageOrderValueCents: number
    revenuePerClickCents: number
    clicksByDate: Record<string, number>
    clicksByHour: Record<string, number>
    conversionByDate: Record<string, number>
    conversionByHour: Record<string, number>
    revenueByDate: Record<string, number>
    revenueByHour: Record<string, number>
    clicksByCountry: CountryStat[]
    clicksByCity: CityStat[]
    clicksByDevice: DeviceStat[]
    clicksByOS: TechStat[]
    clicksByBrowser: TechStat[]
    clicksByChannel: TechStat[]
    clicksByTrafficType: Array<{ trafficType: string; clicks: number; percentage: number }>
    clicksByAiAgent: Array<{ aiAgent: string; clicks: number; percentage: number }>
    clicksByReferrer: ReferrerStat[]
    utmPerformance: {
      sources: UtmStat[]
      mediums: UtmStat[]
      campaigns: UtmStat[]
    }
    goals: GoalStat[]
    rulePerformance: RulePerformance[]
    experimentAnalysis: {
      controlId: string | null
      results: StatisticalResult[]
      leadingVariantId: string | null
      hasSignificantWinner: boolean
      summary: string
    }
    recentClicks: RecentClick[]
  }
}

export type ActiveTab = 'overview' | 'geo' | 'channels' | 'tech' | 'agents' | 'utm' | 'goals'

export type ChartMetric = 'clicks' | 'conversions' | 'revenue' | 'both'

export interface AnalyticsFilters {
  country: string | null
  device: string | null
  referrer: string | null
}
