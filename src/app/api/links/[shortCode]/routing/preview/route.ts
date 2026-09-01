import { NextRequest, NextResponse } from 'next/server'
import { getManageableUrl } from '@/lib/authorization'
import { getLatestRevision } from '@/lib/link-cache'
import { chooseSmartRule, type DeviceKind, type OperatingSystem, type TrafficKind } from '@/lib/smart-routing'
import { prisma } from '@/lib/prisma'

const DEVICES = new Set<DeviceKind>(['mobile', 'tablet', 'desktop', 'bot'])
const TRAFFIC = new Set<TrafficKind>(['human', 'ai_agent', 'bot'])
const OS = new Set<OperatingSystem>(['ios', 'android', 'macos', 'windows', 'linux', 'chromeos', 'other'])

export async function POST(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  const { shortCode } = await context.params
  const access = await getManageableUrl(request, shortCode)
  if (!access.url) return NextResponse.json({ error: access.error }, { status: access.status })

  try {
    const body = (await request.json()) as Record<string, unknown>
    const country = String(body.country ?? 'XX').trim().toUpperCase()
    const deviceType = String(body.deviceType ?? 'desktop') as DeviceKind
    const os = String(body.os ?? 'other') as OperatingSystem
    const language = String(body.language ?? 'en').trim().toLowerCase()
    const trafficType = String(body.trafficType ?? 'human') as TrafficKind
    const aiAgent = body.aiAgent ? String(body.aiAgent).trim().toLowerCase() : null
    const referrerHost = body.referrerHost ? String(body.referrerHost).trim().toLowerCase() : null

    if (!/^[A-Z]{2}$/.test(country)) throw new Error('Country must be an ISO 2-letter code')
    if (!DEVICES.has(deviceType)) throw new Error('Invalid device type')
    if (!OS.has(os)) throw new Error('Invalid operating system')
    if (!TRAFFIC.has(trafficType)) throw new Error('Invalid traffic type')
    if (!/^[a-z]{2,3}$/.test(language)) throw new Error('Invalid language code')
    if (referrerHost && !/^[a-z0-9.-]+$/.test(referrerHost)) throw new Error('Invalid referrer host')

    const rules = await prisma.linkRule.findMany({
      where: { urlId: access.url.id, enabled: true, riskStatus: { not: 'blocked' } },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true, name: true, destinationUrl: true, priority: true, weight: true, enabled: true,
        healthStatus: true, countryCodes: true, deviceType: true, trafficType: true,
        aiAgent: true, os: true, languageCodes: true, referrerDomain: true, startAt: true, endAt: true,
      },
    })

    const matched = chooseSmartRule(rules, {
      country, deviceType, os, language, trafficType, aiAgent, referrerHost, now: new Date(),
    }, shortCode, 'preview-visitor')
    const revision = matched ? null : await getLatestRevision(access.url.id)

    return NextResponse.json({
      matchedRule: matched ? {
        id: matched.id,
        name: matched.name,
        destinationUrl: matched.destinationUrl,
        priority: matched.priority,
        weight: matched.weight,
      } : null,
      destination: matched?.destinationUrl ?? revision?.destinationUrl ?? access.url.originalUrl,
      fallback: !matched,
      evaluatedAt: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid routing preview' }, { status: 400 })
  }
}
