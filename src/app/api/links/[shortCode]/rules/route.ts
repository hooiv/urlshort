import { publishWorkspaceRoutingConfig } from '@/lib/routing-config'
import { NextRequest, NextResponse } from 'next/server'
import type { TrafficType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { recordAudit } from '@/lib/audit'
import { getManageableUrl } from '@/lib/authorization'
import { assessDestination } from '@/lib/link-safety'
import { assertDestinationSafeForStorage } from '@/lib/destination-health'
import { invalidateLink } from '@/lib/link-cache'
import { rateLimit } from '@/lib/rate-limit'
import {
  normalizeCountryCodes,
  normalizeList,
  normalizeReferrerDomain,
  normalizeSafeUrl,
  parseOptionalDate,
} from '@/lib/smart-routing'

const DEVICE_TYPES = new Set(['mobile', 'tablet', 'desktop', 'bot'])
const TRAFFIC_TYPES = new Set(['human', 'ai_agent', 'bot'])
const OS_TYPES = new Set(['ios', 'android', 'macos', 'windows', 'linux', 'chromeos', 'other'])
const LANGUAGE_TYPES = new Set(['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh', 'hi', 'ar', 'ru', 'nl', 'pl', 'tr'])
const AI_AGENTS = new Set(['openai', 'openai-search', 'chatgpt-user', 'anthropic', 'claude-user', 'perplexity', 'google-ai', 'google-other', 'google-gemini', 'amazon', 'bytedance', 'common-crawl', 'cohere', 'youcom'])

type RuleInput = {
  name?: unknown
  destinationUrl?: unknown
  priority?: unknown
  weight?: unknown
  enabled?: unknown
  countryCodes?: unknown
  deviceType?: unknown
  referrerDomain?: unknown
  trafficType?: unknown
  aiAgent?: unknown
  os?: unknown
  languageCodes?: unknown
  startAt?: unknown
  endAt?: unknown
}

async function getUrl(request: NextRequest, shortCode: string) {
  const result = await getManageableUrl(request, shortCode)
  if (!result.url) return NextResponse.json({ error: result.error }, { status: result.status })
  return result.url
}
function parseRule(input: RuleInput) {
  const name = String(input.name ?? '').trim()
  if (!name || name.length > 80) throw new Error('Rule name must be 1–80 characters')

  const destinationUrl = normalizeSafeUrl(String(input.destinationUrl ?? ''))
  const priority = Number(input.priority ?? 100)
  const weight = Number(input.weight ?? 100)
  if (!Number.isInteger(priority) || priority < 0 || priority > 10000) throw new Error('Priority must be 0–10000')
  if (!Number.isInteger(weight) || weight < 0 || weight > 1000) throw new Error('Weight must be 0–1000')

  const deviceType = input.deviceType === '' || input.deviceType == null ? null : String(input.deviceType)
  if (deviceType && !DEVICE_TYPES.has(deviceType)) throw new Error('Invalid device type')

  const startAt = parseOptionalDate(input.startAt)
  const endAt = parseOptionalDate(input.endAt)
  if (startAt && endAt && endAt <= startAt) throw new Error('End time must be after start time')

  return {
    name,
    destinationUrl,
    priority,
    weight,
    enabled: input.enabled === undefined ? true : Boolean(input.enabled),
    countryCodes: normalizeCountryCodes(input.countryCodes),
    deviceType: deviceType as 'mobile' | 'tablet' | 'desktop' | 'bot' | null,
    trafficType: input.trafficType === '' || input.trafficType == null ? null : String(input.trafficType) as TrafficType,
    aiAgent: normalizeList(input.aiAgent, AI_AGENTS, 'AI agent'),
    os: normalizeList(input.os, OS_TYPES, 'Operating system'),
    languageCodes: normalizeList(input.languageCodes, LANGUAGE_TYPES, 'Language'),
    referrerDomain: normalizeReferrerDomain(input.referrerDomain),
    startAt,
    endAt,
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  const { shortCode } = await context.params
  const result = await getUrl(request, shortCode)
  if (result instanceof NextResponse) return result

  const rules = await prisma.linkRule.findMany({
    where: { urlId: result.id },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  })
  return NextResponse.json(rules)
}
export async function POST(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  const { shortCode } = await context.params
  const result = await getUrl(request, shortCode)
  if (result instanceof NextResponse) return result

  const limit = await rateLimit(request, { name: 'rules-create', identifier: result.id, limit: 20, windowMs: 60_000 })
  if (!limit.allowed) return NextResponse.json({ error: 'Too many rule requests. Try again shortly.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } })

  try {
  const body = (await request.json()) as RuleInput
  const rule = parseRule(body)
    if (rule.trafficType && !TRAFFIC_TYPES.has(rule.trafficType)) throw new Error('Invalid traffic type')
    // SSRF guard: rule destinations must be publicly routable, same as creation.
    await assertDestinationSafeForStorage(rule.destinationUrl)
    const risk = assessDestination(rule.destinationUrl)
    const created = await prisma.linkRule.create({ data: { ...rule, urlId: result.id, riskStatus: risk.status, riskReason: risk.reason, riskCheckedAt: new Date() } })
    await invalidateLink(result.shortCode, result.id)
    if (result.workspaceId) await publishWorkspaceRoutingConfig(result.workspaceId)
    await recordAudit(request, { action: 'routing_rule.create', urlId: result.id, resourceType: 'link_rule', resourceId: created.id, after: { ...rule, riskStatus: risk.status, riskReason: risk.reason } })
    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid rule'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
