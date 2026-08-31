import { NextRequest, NextResponse } from 'next/server'
import type { DeviceType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getManageableUrl, READ_ROLES } from '@/lib/authorization'
import { rateLimit } from '@/lib/rate-limit'
import {
  countryToFlag,
  countryToName,
  getBrowser,
  getOperatingSystem,
  getTrafficSource,
} from '@/lib/smart-routing'
import { analyzeExperiment, type VariantStats } from '@/lib/stats'

const RANGE_DAYS: Record<string, number> = { '24h': 1, '7d': 7, '30d': 30, '90d': 90, all: 3650 }
const MAX_RANGE_DAYS = 3650

function parseWindow(request: NextRequest): { from: Date; to: Date; range: string; isHourly: boolean } {
  const params = request.nextUrl.searchParams
  const rangeParam = params.get('range')
  const fromParam = params.get('from')
  const toParam = params.get('to')

  if (fromParam || toParam) {
    const to = toParam ? new Date(`${toParam}T23:59:59.999Z`) : new Date()
    const from = fromParam ? new Date(`${fromParam}T00:00:00.000Z`) : new Date(to.getTime() - 30 * 86_400_000)
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
      throw new Error('Invalid date range')
    }
    if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * 86_400_000) {
      throw new Error('Date range too large (max 10 years)')
    }
    const diffHours = (to.getTime() - from.getTime()) / 3_600_000
    return { from, to, range: 'custom', isHourly: diffHours <= 48 }
  }

  const range = rangeParam || '30d'
  const days = RANGE_DAYS[range] ?? RANGE_DAYS['30d']
  const to = new Date()
  const from = new Date(to.getTime() - days * 86_400_000)
  return { from, to, range, isHourly: range === '24h' }
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function hourKey(date: Date): string {
  const d = new Date(date)
  d.setMinutes(0, 0, 0)
  return d.toISOString().slice(0, 13) + ':00'
}

function extractUtmParams(referer: string | null | undefined): Record<string, string> {
  if (!referer) return {}
  try {
    const url = new URL(referer)
    const result: Record<string, string> = {}
    for (const [k, v] of url.searchParams.entries()) {
      if (k.startsWith('utm_') && v) {
        result[k] = v.trim().slice(0, 100)
      }
    }
    return result
  } catch {
    return {}
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  try {
    const limit = await rateLimit(request, { name: 'analytics', limit: 120, windowMs: 60_000 })
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    const { shortCode } = await context.params
    const access = await getManageableUrl(request, shortCode, READ_ROLES)
    if (!access.url) return NextResponse.json({ error: access.error }, { status: access.status })

    const url = await prisma.url.findUnique({
      where: { id: access.url.id },
      select: {
        id: true,
        originalUrl: true,
        shortCode: true,
        title: true,
        clicks: true,
        createdAt: true,
      },
    })
    if (!url) return NextResponse.json({ error: 'URL not found' }, { status: 404 })

    let window: { from: Date; to: Date; range: string; isHourly: boolean }
    try {
      window = parseWindow(request)
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Invalid date range' },
        { status: 400 }
      )
    }

    const { from, to, isHourly } = window
    const inWindow = { gte: from, lte: to }
    const fromKey = dateKey(from)
    const toKey = dateKey(to)

    // Optional segment filters from query params
    const filterCountry = request.nextUrl.searchParams.get('country') || undefined
    const filterDevice = request.nextUrl.searchParams.get('device') || undefined
    const filterReferrer = request.nextUrl.searchParams.get('referrer') || undefined
    const filterRuleId = request.nextUrl.searchParams.get('ruleId') || undefined

    const clickFilter = {
      urlId: url.id,
      createdAt: inWindow,
      ...(filterCountry ? { country: filterCountry === 'Unknown' ? null : filterCountry } : {}),
      ...(filterDevice ? { deviceType: filterDevice as DeviceType } : {}),
      ...(filterReferrer ? { referrerHost: filterReferrer === 'Direct' ? null : filterReferrer } : {}),
      ...(filterRuleId ? { ruleId: filterRuleId } : {}),
    }

    const [
      dailyClicks,
      events,
      countries,
      cities,
      devices,
      referrers,
      recentClicks,
      goals,
      goalTotals,
      dailyConversions,
      rules,
      ruleClicks,
      ruleConversions,
      windowClickCount,
    ] = await Promise.all([
      prisma.clickDaily.findMany({
        where: { urlId: url.id, dateKey: { gte: fromKey, lte: toKey } },
        orderBy: { dateKey: 'asc' },
      }),
      prisma.clickEvent.findMany({
        where: clickFilter,
        select: {
          id: true,
          createdAt: true,
          country: true,
          city: true,
          referrerHost: true,
          referer: true,
          userAgent: true,
          deviceType: true,
          trafficType: true,
          aiAgent: true,
          os: true,
          browser: true,
          language: true,
          ruleId: true,
        },
        orderBy: { createdAt: 'asc' },
        take: 5000,
      }),
      prisma.clickEvent.groupBy({
        by: ['country'],
        where: clickFilter,
        _count: { _all: true },
        orderBy: { _count: { country: 'desc' } },
        take: 30,
      }),
      prisma.clickEvent.groupBy({
        by: ['city', 'country'],
        where: { ...clickFilter, city: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { city: 'desc' } },
        take: 20,
      }),
      prisma.clickEvent.groupBy({
        by: ['deviceType'],
        where: clickFilter,
        _count: { _all: true },
      }),
      prisma.clickEvent.groupBy({
        by: ['referrerHost'],
        where: clickFilter,
        _count: { _all: true },
        orderBy: { _count: { referrerHost: 'desc' } },
        take: 30,
      }),
      prisma.clickEvent.findMany({
        where: { urlId: url.id },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: {
          id: true,
          createdAt: true,
          country: true,
          city: true,
          referrerHost: true,
          referer: true,
          userAgent: true,
          deviceType: true,
          ruleId: true,
        },
      }),
      prisma.goal.findMany({
        where: { urlId: url.id },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, eventKey: true, enabled: true },
      }),
      prisma.conversionEvent.groupBy({
        by: ['goalId'],
        where: { urlId: url.id, createdAt: inWindow },
        _count: { _all: true },
        _sum: { valueCents: true },
      }),
      prisma.conversionDaily.findMany({
        where: { goal: { urlId: url.id }, dateKey: { gte: fromKey, lte: toKey } },
        orderBy: { dateKey: 'asc' },
        include: { goal: { select: { name: true, eventKey: true } } },
      }),
      prisma.linkRule.findMany({
        where: { urlId: url.id },
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          name: true,
          destinationUrl: true,
          priority: true,
          weight: true,
          enabled: true,
        },
      }),
      prisma.clickEvent.groupBy({
        by: ['ruleId'],
        where: { urlId: url.id, ruleId: { not: null }, createdAt: inWindow },
        _count: { _all: true },
      }),
      prisma.conversionEvent.groupBy({
        by: ['ruleId'],
        where: { urlId: url.id, ruleId: { not: null }, createdAt: inWindow },
        _count: { _all: true },
        _sum: { valueCents: true },
      }),
      prisma.clickEvent.count({ where: clickFilter }),
    ])

    // Time-series rollups
    const clicksByDate: Record<string, number> = {}
    const clicksByHour: Record<string, number> = {}
    const conversionByDate: Record<string, number> = {}
    const conversionByHour: Record<string, number> = {}
    const revenueByDate: Record<string, number> = {}

    for (const row of dailyClicks) {
      clicksByDate[row.dateKey] = row.clicks
    }

    for (const row of dailyConversions) {
      conversionByDate[row.dateKey] = (conversionByDate[row.dateKey] || 0) + row.conversions
      revenueByDate[row.dateKey] = (revenueByDate[row.dateKey] || 0) + (row.valueCents || 0)
    }

    // Process granular events for OS, Browser, Channel, Hourly breakdowns, and UTM
    const osMap: Record<string, number> = {}
    const browserMap: Record<string, number> = {}
    const channelMap: Record<string, number> = {}
    const trafficTypeMap: Record<string, number> = {}
    const aiAgentMap: Record<string, number> = {}
    const utmSources: Record<string, { clicks: number; conversions: number; valueCents: number }> = {}
    const utmMediums: Record<string, { clicks: number; conversions: number; valueCents: number }> = {}
    const utmCampaigns: Record<string, { clicks: number; conversions: number; valueCents: number }> = {}

    for (const event of events) {
      const os = getOperatingSystem(event.userAgent)
      const browser = getBrowser(event.userAgent)
      const { channel } = getTrafficSource(event.referrerHost)

      osMap[os] = (osMap[os] || 0) + 1
      browserMap[browser] = (browserMap[browser] || 0) + 1
      channelMap[channel] = (channelMap[channel] || 0) + 1
      trafficTypeMap[event.trafficType] = (trafficTypeMap[event.trafficType] || 0) + 1
      if (event.aiAgent) aiAgentMap[event.aiAgent] = (aiAgentMap[event.aiAgent] || 0) + 1

      if (isHourly) {
        const hk = hourKey(event.createdAt)
        clicksByHour[hk] = (clicksByHour[hk] || 0) + 1
      }

      // Parse UTM parameters if present in referer
      const utms = extractUtmParams(event.referer)
      if (utms.utm_source) {
        const key = utms.utm_source
        if (!utmSources[key]) utmSources[key] = { clicks: 0, conversions: 0, valueCents: 0 }
        utmSources[key].clicks += 1
      }
      if (utms.utm_medium) {
        const key = utms.utm_medium
        if (!utmMediums[key]) utmMediums[key] = { clicks: 0, conversions: 0, valueCents: 0 }
        utmMediums[key].clicks += 1
      }
      if (utms.utm_campaign) {
        const key = utms.utm_campaign
        if (!utmCampaigns[key]) utmCampaigns[key] = { clicks: 0, conversions: 0, valueCents: 0 }
        utmCampaigns[key].clicks += 1
      }
    }

    const windowClicks = windowClickCount
    const totalConversions = goalTotals.reduce((sum, row) => sum + row._count._all, 0)
    const totalValueCents = goalTotals.reduce((sum, row) => sum + (row._sum.valueCents ?? 0), 0)

    // Formatted Country Breakdown
    const clicksByCountry = countries.map((row) => {
      const code = row.country || 'XX'
      const count = row._count._all
      return {
        code,
        name: countryToName(code),
        flag: countryToFlag(code),
        clicks: count,
        percentage: windowClicks ? Number(((count / windowClicks) * 100).toFixed(1)) : 0,
      }
    })

    // Formatted City Breakdown
    const clicksByCity = cities.map((row) => {
      const city = row.city || 'Unknown'
      const code = row.country || 'XX'
      const count = row._count._all
      return {
        city,
        country: code,
        name: `${city}, ${countryToName(code)}`,
        flag: countryToFlag(code),
        clicks: count,
        percentage: windowClicks ? Number(((count / windowClicks) * 100).toFixed(1)) : 0,
      }
    })

    // Formatted Device Breakdown
    const clicksByDevice = devices.map((row) => {
      const device = row.deviceType || 'unknown'
      const count = row._count._all
      return {
        device,
        clicks: count,
        percentage: windowClicks ? Number(((count / windowClicks) * 100).toFixed(1)) : 0,
      }
    })

    // Formatted OS Breakdown
    const clicksByOS = Object.entries(osMap)
      .map(([os, count]) => ({
        os,
        clicks: count,
        percentage: windowClicks ? Number(((count / windowClicks) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.clicks - a.clicks)

    // Formatted Browser Breakdown
    const clicksByBrowser = Object.entries(browserMap)
      .map(([browser, count]) => ({
        browser,
        clicks: count,
        percentage: windowClicks ? Number(((count / windowClicks) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.clicks - a.clicks)

    // Formatted Channel Breakdown
    const clicksByChannel = Object.entries(channelMap)
      .map(([channel, count]) => ({
        channel,
        clicks: count,
        percentage: windowClicks ? Number(((count / windowClicks) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.clicks - a.clicks)

    // Formatted Referrer Breakdown
    const clicksByReferrer = referrers.map((row) => {
      const host = row.referrerHost || 'Direct'
      const { channel, sourceName } = getTrafficSource(row.referrerHost)
      const count = row._count._all
      return {
        host,
        sourceName,
        channel,
        clicks: count,
        percentage: windowClicks ? Number(((count / windowClicks) * 100).toFixed(1)) : 0,
      }
    })

    // UTM Breakdown
    const utmPerformance = {
      sources: Object.entries(utmSources)
        .map(([name, stat]) => ({
          name,
          clicks: stat.clicks,
          conversions: stat.conversions,
          conversionRate: stat.clicks ? stat.conversions / stat.clicks : 0,
          valueCents: stat.valueCents,
        }))
        .sort((a, b) => b.clicks - a.clicks),
      mediums: Object.entries(utmMediums)
        .map(([name, stat]) => ({
          name,
          clicks: stat.clicks,
          conversions: stat.conversions,
          conversionRate: stat.clicks ? stat.conversions / stat.clicks : 0,
          valueCents: stat.valueCents,
        }))
        .sort((a, b) => b.clicks - a.clicks),
      campaigns: Object.entries(utmCampaigns)
        .map(([name, stat]) => ({
          name,
          clicks: stat.clicks,
          conversions: stat.conversions,
          conversionRate: stat.clicks ? stat.conversions / stat.clicks : 0,
          valueCents: stat.valueCents,
        }))
        .sort((a, b) => b.clicks - a.clicks),
    }

    // Goals mapping
    const goalTotalsMap = new Map(
      goalTotals.map((row) => [row.goalId, { conversions: row._count._all, valueCents: row._sum.valueCents ?? 0 }])
    )

    // Rule performance & A/B testing statistical engine
    const clickMap = new Map(ruleClicks.map((row) => [row.ruleId as string, row._count._all]))
    const conversionMap = new Map(
      ruleConversions.map((row) => [
        row.ruleId as string,
        { conversions: row._count._all, valueCents: row._sum.valueCents ?? 0 },
      ])
    )

    // Base fallback clicks (clicks without ruleId)
    const baseClicks = windowClicks - ruleClicks.reduce((sum, r) => sum + r._count._all, 0)
    const baseConversions = totalConversions - ruleConversions.reduce((sum, r) => sum + r._count._all, 0)
    const baseValueCents = totalValueCents - ruleConversions.reduce((sum, r) => sum + (r._sum.valueCents ?? 0), 0)

    const experimentVariants: VariantStats[] = [
      {
        id: 'default',
        name: 'Default Destination (Control)',
        clicks: Math.max(0, baseClicks),
        conversions: Math.max(0, baseConversions),
        conversionRate: baseClicks > 0 ? baseConversions / baseClicks : 0,
        valueCents: Math.max(0, baseValueCents),
      },
      ...rules.map((rule) => {
        const clicks = clickMap.get(rule.id) ?? 0
        const conv = conversionMap.get(rule.id) ?? { conversions: 0, valueCents: 0 }
        return {
          id: rule.id,
          name: rule.name,
          clicks,
          conversions: conv.conversions,
          conversionRate: clicks ? conv.conversions / clicks : 0,
          valueCents: conv.valueCents,
        }
      }),
    ]

    const experimentAnalysis = analyzeExperiment(experimentVariants)

    const rulePerformance = rules.map((rule) => {
      const clicks = clickMap.get(rule.id) ?? 0
      const conversion = conversionMap.get(rule.id) ?? { conversions: 0, valueCents: 0 }
      return {
        ...rule,
        clicks,
        conversions: conversion.conversions,
        conversionRate: clicks ? conversion.conversions / clicks : 0,
        valueCents: conversion.valueCents,
      }
    })

    // Enriched recent clicks
    const enrichedRecentClicks = recentClicks.map((click) => {
      const { channel, sourceName } = getTrafficSource(click.referrerHost)
      const os = getOperatingSystem(click.userAgent)
      const browser = getBrowser(click.userAgent)
      const code = click.country || 'XX'
      return {
        id: click.id,
        createdAt: click.createdAt.toISOString(),
        country: code,
        countryName: countryToName(code),
        flag: countryToFlag(code),
        city: click.city || null,
        referrer: click.referrerHost || 'Direct',
        referrerSource: sourceName,
        channel,
        deviceType: click.deviceType || 'unknown',
        os,
        browser,
        ruleId: click.ruleId,
      }
    })

    return NextResponse.json({
      url,
      window: {
        from: from.toISOString(),
        to: to.toISOString(),
        range: window.range,
        isHourly,
      },
      filters: {
        country: filterCountry || null,
        device: filterDevice || null,
        referrer: filterReferrer || null,
        ruleId: filterRuleId || null,
      },
      analytics: {
        totalClicks: url.clicks,
        windowClicks,
        totalConversions,
        totalValueCents,
        conversionRate: windowClicks ? totalConversions / windowClicks : 0,
        averageOrderValueCents: totalConversions ? Math.round(totalValueCents / totalConversions) : 0,
        revenuePerClickCents: windowClicks ? Math.round(totalValueCents / windowClicks) : 0,
        clicksByDate,
        clicksByHour,
        conversionByDate,
        conversionByHour,
        revenueByDate,
        clicksByCountry,
        clicksByCity,
        clicksByDevice,
        clicksByOS,
        clicksByBrowser,
        clicksByChannel,
        clicksByTrafficType: Object.entries(trafficTypeMap)
          .map(([trafficType, clicks]) => ({ trafficType, clicks, percentage: windowClicks ? Number(((clicks / windowClicks) * 100).toFixed(1)) : 0 }))
          .sort((a, b) => b.clicks - a.clicks),
        clicksByAiAgent: Object.entries(aiAgentMap)
          .map(([aiAgent, clicks]) => ({ aiAgent, clicks, percentage: windowClicks ? Number(((clicks / windowClicks) * 100).toFixed(1)) : 0 }))
          .sort((a, b) => b.clicks - a.clicks),
        clicksByReferrer,
        utmPerformance,
        goals: goals.map((goal) => ({
          ...goal,
          ...(goalTotalsMap.get(goal.id) ?? { conversions: 0, valueCents: 0 }),
        })),
        rulePerformance,
        experimentAnalysis,
        recentClicks: enrichedRecentClicks,
      },
    })
  } catch (error) {
    console.error('Error fetching analytics:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
