import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod/v4'
import type { DeviceType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getManageableUrl, READ_ROLES } from '@/lib/authorization'
import { rateLimit } from '@/lib/rate-limit'
import { countryToFlag, countryToName, getTrafficSource } from '@/lib/smart-routing'
import { analyzeExperiment, type VariantStats } from '@/lib/stats'

const RANGE_DAYS: Record<string, number> = { '24h': 1, '7d': 7, '30d': 30, '90d': 90, all: 3650 }
const MAX_RANGE_DAYS = 3650

const QueryParams = z.object({
  range: z.string().optional().default('30d'),
  from: z.string().optional(),
  to: z.string().optional(),
  country: z.string().optional(),
  device: z.string().optional(),
  referrer: z.string().optional(),
  ruleId: z.string().optional(),
})

function parseWindow(params: z.infer<typeof QueryParams>): { from: Date; to: Date; range: string; isHourly: boolean } {
  if (params.from || params.to) {
    const to = params.to ? new Date(`${params.to}T23:59:59.999Z`) : new Date()
    const from = params.from ? new Date(`${params.from}T00:00:00.000Z`) : new Date(to.getTime() - 30 * 86_400_000)
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
      throw new Error('Invalid date range')
    }
    if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * 86_400_000) {
      throw new Error('Date range too large (max 10 years)')
    }
    const diffHours = (to.getTime() - from.getTime()) / 3_600_000
    return { from, to, range: 'custom', isHourly: diffHours <= 48 }
  }

  const range = params.range
  const days = RANGE_DAYS[range] ?? RANGE_DAYS['30d']
  const to = new Date()
  const from = new Date(to.getTime() - days * 86_400_000)
  return { from, to, range, isHourly: range === '24h' }
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
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

    const rawParams = {
      range: request.nextUrl.searchParams.get('range') ?? '30d',
      from: request.nextUrl.searchParams.get('from') ?? undefined,
      to: request.nextUrl.searchParams.get('to') ?? undefined,
      country: request.nextUrl.searchParams.get('country') ?? undefined,
      device: request.nextUrl.searchParams.get('device') ?? undefined,
      referrer: request.nextUrl.searchParams.get('referrer') ?? undefined,
      ruleId: request.nextUrl.searchParams.get('ruleId') ?? undefined,
    }
    const parsed = QueryParams.safeParse(rawParams)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid query parameters' }, { status: 400 })
    }

    let window: { from: Date; to: Date; range: string; isHourly: boolean }
    try {
      window = parseWindow(parsed.data)
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

    const filterCountry = parsed.data.country
    const filterDevice = parsed.data.device
    const filterReferrer = parsed.data.referrer
    const filterRuleId = parsed.data.ruleId

    const clickFilter = {
      urlId: url.id,
      createdAt: inWindow,
      ...(filterCountry ? { country: filterCountry === 'Unknown' ? null : filterCountry } : {}),
      ...(filterDevice ? { deviceType: filterDevice as DeviceType } : {}),
      ...(filterReferrer ? { referrerHost: filterReferrer === 'Direct' ? null : filterReferrer } : {}),
      ...(filterRuleId ? { ruleId: filterRuleId } : {}),
    }

    // All queries execute in parallel — no dependency between them.
    const [
      dailyClicks,
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
      osBreakdown,
      browserBreakdown,
      trafficTypeBreakdown,
      aiAgentBreakdown,
      utmSourceClicks,
      utmMediumClicks,
      utmCampaignClicks,
      hourlyClicks,
      hourlyConversions,
      utmConversions,
    ] = await Promise.all([
      prisma.clickDaily.findMany({
        where: { urlId: url.id, dateKey: { gte: fromKey, lte: toKey } },
        orderBy: { dateKey: 'asc' },
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
        take: 50,
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
          deviceType: true,
          os: true,
          browser: true,
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

      // OS breakdown — uses pre-stored os column, no re-parsing needed.
      prisma.clickEvent.groupBy({
        by: ['os'],
        where: clickFilter,
        _count: { _all: true },
        orderBy: { _count: { os: 'desc' } },
      }),

      // Browser breakdown — uses pre-stored browser column.
      prisma.clickEvent.groupBy({
        by: ['browser'],
        where: clickFilter,
        _count: { _all: true },
        orderBy: { _count: { browser: 'desc' } },
      }),

      // Traffic type breakdown (human / ai_agent / bot).
      prisma.clickEvent.groupBy({
        by: ['trafficType'],
        where: clickFilter,
        _count: { _all: true },
        orderBy: { _count: { trafficType: 'desc' } },
      }),

      // AI agent breakdown — exclude null entries.
      prisma.clickEvent.groupBy({
        by: ['aiAgent'],
        where: { ...clickFilter, aiAgent: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { aiAgent: 'desc' } },
      }),

      // UTM click counts — separate queries per dimension for clean aggregation.
      prisma.clickEvent.groupBy({
        by: ['utmSource'],
        where: { ...clickFilter, utmSource: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { utmSource: 'desc' } },
        take: 30,
      }),
      prisma.clickEvent.groupBy({
        by: ['utmMedium'],
        where: { ...clickFilter, utmMedium: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { utmMedium: 'desc' } },
        take: 30,
      }),
      prisma.clickEvent.groupBy({
        by: ['utmCampaign'],
        where: { ...clickFilter, utmCampaign: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { utmCampaign: 'desc' } },
        take: 30,
      }),

      // Hourly click rollup — raw SQL for date_trunc grouping.
      isHourly
        ? prisma.$queryRaw<{ hour: string; count: number }[]>`
            SELECT
              to_char(date_trunc('hour', "createdAt"), 'YYYY-MM-DD"T"HH24:00:00') as hour,
              COUNT(*)::int as count
            FROM click_events
            WHERE "urlId" = ${url.id}
              AND "createdAt" >= ${from}
              AND "createdAt" <= ${to}
            GROUP BY date_trunc('hour', "createdAt")
            ORDER BY hour
          `
        : Promise.resolve([]),

      // Hourly conversion + revenue rollup — raw SQL for date_trunc grouping.
      isHourly
        ? prisma.$queryRaw<{ hour: string; conversions: number; valueCents: number }[]>`
            SELECT
              to_char(date_trunc('hour', "createdAt"), 'YYYY-MM-DD"T"HH24:00:00') as hour,
              COUNT(*)::int as "conversions",
              COALESCE(SUM("valueCents"), 0)::int as "valueCents"
            FROM conversion_events
            WHERE "urlId" = ${url.id}
              AND "createdAt" >= ${from}
              AND "createdAt" <= ${to}
            GROUP BY date_trunc('hour', "createdAt")
            ORDER BY hour
          `
        : Promise.resolve([]),

      // UTM conversion data — join conversion_events with click_events to get
      // the UTM parameters that were active at click time.
      prisma.$queryRaw<Array<{
        utmSource: string | null
        utmMedium: string | null
        utmCampaign: string | null
        conversions: number
        valueCents: number
      }>>`
        SELECT
          ce."utmSource",
          ce."utmMedium",
          ce."utmCampaign",
          COUNT(conv.id)::int as "conversions",
          COALESCE(SUM(conv."valueCents"), 0)::int as "valueCents"
        FROM conversion_events conv
        JOIN click_events ce ON ce.id = conv."clickEventId"
        WHERE conv."urlId" = ${url.id}
          AND conv."createdAt" >= ${from}
          AND conv."createdAt" <= ${to}
        GROUP BY ce."utmSource", ce."utmMedium", ce."utmCampaign"
      `,
    ])

    // --- Data transformation (pure, no I/O) ---

    const windowClicks = windowClickCount
    const totalConversions = goalTotals.reduce((sum, row) => sum + row._count._all, 0)
    const totalValueCents = goalTotals.reduce((sum, row) => sum + (row._sum.valueCents ?? 0), 0)

    // Time-series rollups from pre-aggregated daily tables.
    const clicksByDate: Record<string, number> = {}
    for (const row of dailyClicks) {
      clicksByDate[row.dateKey] = row.clicks
    }

    const clicksByHour: Record<string, number> = {}
    for (const row of hourlyClicks) {
      clicksByHour[row.hour] = row.count
    }

    const conversionByDate: Record<string, number> = {}
    const revenueByDate: Record<string, number> = {}
    for (const row of dailyConversions) {
      conversionByDate[row.dateKey] = (conversionByDate[row.dateKey] || 0) + row.conversions
      revenueByDate[row.dateKey] = (revenueByDate[row.dateKey] || 0) + (row.valueCents || 0)
    }

    // Conversion hourly rollup from the hourly conversion query above.
    const conversionByHour: Record<string, number> = {}
    const revenueByHour: Record<string, number> = {}
    for (const row of hourlyConversions) {
      conversionByHour[row.hour] = row.conversions
      revenueByHour[row.hour] = row.valueCents
    }

    // Channel breakdown: derive from the referrer groupBy results.
    const channelMap: Record<string, number> = {}
    for (const ref of referrers) {
      const { channel } = getTrafficSource(ref.referrerHost)
      channelMap[channel] = (channelMap[channel] || 0) + ref._count._all
    }

    // OS, Browser, Traffic Type, AI Agent — direct from groupBy.
    const clicksByOS = osBreakdown
      .map((row) => ({
        os: row.os || 'other',
        clicks: row._count._all,
        percentage: windowClicks ? Number(((row._count._all / windowClicks) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.clicks - a.clicks)

    const clicksByBrowser = browserBreakdown
      .map((row) => ({
        browser: row.browser || 'other',
        clicks: row._count._all,
        percentage: windowClicks ? Number(((row._count._all / windowClicks) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.clicks - a.clicks)

    const clicksByTrafficType = trafficTypeBreakdown
      .map((row) => ({
        trafficType: row.trafficType,
        clicks: row._count._all,
        percentage: windowClicks ? Number(((row._count._all / windowClicks) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.clicks - a.clicks)

    const clicksByAiAgent = aiAgentBreakdown
      .map((row) => ({
        aiAgent: row.aiAgent!,
        clicks: row._count._all,
        percentage: windowClicks ? Number(((row._count._all / windowClicks) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.clicks - a.clicks)

    const clicksByChannel = Object.entries(channelMap)
      .map(([channel, clicks]) => ({
        channel,
        clicks,
        percentage: windowClicks ? Number(((clicks / windowClicks) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.clicks - a.clicks)

    // Country breakdown.
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

    // City breakdown.
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

    // Device breakdown.
    const clicksByDevice = devices.map((row) => {
      const device = row.deviceType || 'unknown'
      const count = row._count._all
      return {
        device,
        clicks: count,
        percentage: windowClicks ? Number(((count / windowClicks) * 100).toFixed(1)) : 0,
      }
    })

    // Referrer breakdown.
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

    // UTM performance — merge click counts with conversion data from the raw SQL join.
    const utmConversionBySource = new Map<string, { conversions: number; valueCents: number }>()
    const utmConversionByMedium = new Map<string, { conversions: number; valueCents: number }>()
    const utmConversionByCampaign = new Map<string, { conversions: number; valueCents: number }>()

    for (const row of utmConversions) {
      if (row.utmSource) {
        const existing = utmConversionBySource.get(row.utmSource) ?? { conversions: 0, valueCents: 0 }
        existing.conversions += row.conversions
        existing.valueCents += row.valueCents
        utmConversionBySource.set(row.utmSource, existing)
      }
      if (row.utmMedium) {
        const existing = utmConversionByMedium.get(row.utmMedium) ?? { conversions: 0, valueCents: 0 }
        existing.conversions += row.conversions
        existing.valueCents += row.valueCents
        utmConversionByMedium.set(row.utmMedium, existing)
      }
      if (row.utmCampaign) {
        const existing = utmConversionByCampaign.get(row.utmCampaign) ?? { conversions: 0, valueCents: 0 }
        existing.conversions += row.conversions
        existing.valueCents += row.valueCents
        utmConversionByCampaign.set(row.utmCampaign, existing)
      }
    }

    function buildUtmList(
      clickGroups: Array<{ utmSource?: string | null; utmMedium?: string | null; utmCampaign?: string | null; _count: { _all: number } }>,
      getName: (row: typeof clickGroups[number]) => string,
      convMap: Map<string, { conversions: number; valueCents: number }>,
    ) {
      return clickGroups.map((row) => {
        const name = getName(row)
        const clicks = row._count._all
        const conv = convMap.get(name) ?? { conversions: 0, valueCents: 0 }
        return {
          name,
          clicks,
          conversions: conv.conversions,
          conversionRate: clicks ? conv.conversions / clicks : 0,
          valueCents: conv.valueCents,
        }
      })
    }

    const utmPerformance = {
      sources: buildUtmList(utmSourceClicks, (r) => r.utmSource!, utmConversionBySource),
      mediums: buildUtmList(utmMediumClicks, (r) => r.utmMedium!, utmConversionByMedium),
      campaigns: buildUtmList(utmCampaignClicks, (r) => r.utmCampaign!, utmConversionByCampaign),
    }

    // Goals.
    const goalTotalsMap = new Map(
      goalTotals.map((row) => [row.goalId, { conversions: row._count._all, valueCents: row._sum.valueCents ?? 0 }])
    )

    // Rule performance & A/B testing statistical engine.
    const clickMap = new Map(ruleClicks.map((row) => [row.ruleId as string, row._count._all]))
    const conversionMap = new Map(
      ruleConversions.map((row) => [
        row.ruleId as string,
        { conversions: row._count._all, valueCents: row._sum.valueCents ?? 0 },
      ])
    )

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

    // Enriched recent clicks — lightweight, no user-agent re-parsing needed.
    const enrichedRecentClicks = recentClicks.map((click) => {
      const { channel, sourceName } = getTrafficSource(click.referrerHost)
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
        os: click.os || 'other',
        browser: click.browser || 'other',
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
        revenueByHour,
        clicksByCountry,
        clicksByCity,
        clicksByDevice,
        clicksByOS,
        clicksByBrowser,
        clicksByChannel,
        clicksByTrafficType,
        clicksByAiAgent,
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
