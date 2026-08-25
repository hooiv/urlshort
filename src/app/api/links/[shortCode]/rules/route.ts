import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { recordAudit } from '@/lib/audit'
import { getManageableUrl } from '@/lib/authorization'
import { assessDestination } from '@/lib/link-safety'
import { assertDestinationSafeForStorage } from '@/lib/destination-health'
import { invalidateLink } from '@/lib/link-cache'
import {
  normalizeCountryCodes,
  normalizeReferrerDomain,
  normalizeSafeUrl,
  parseOptionalDate,
} from '@/lib/smart-routing'

const DEVICE_TYPES = new Set(['mobile', 'tablet', 'desktop', 'bot'])

type RuleInput = {
  name?: unknown
  destinationUrl?: unknown
  priority?: unknown
  weight?: unknown
  enabled?: unknown
  countryCodes?: unknown
  deviceType?: unknown
  referrerDomain?: unknown
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

  try {
    const body = (await request.json()) as RuleInput
    const rule = parseRule(body)
    // SSRF guard: rule destinations must be publicly routable, same as creation.
    await assertDestinationSafeForStorage(rule.destinationUrl)
    const risk = assessDestination(rule.destinationUrl)
    const created = await prisma.linkRule.create({ data: { ...rule, urlId: result.id, riskStatus: risk.status, riskReason: risk.reason, riskCheckedAt: new Date() } })
    invalidateLink(result.shortCode, result.id)
    await recordAudit(request, { action: 'routing_rule.create', urlId: result.id, resourceType: 'link_rule', resourceId: created.id, after: { ...rule, riskStatus: risk.status, riskReason: risk.reason } })
    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid rule'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
