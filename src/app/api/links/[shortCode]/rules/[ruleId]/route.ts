import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { recordAudit } from '@/lib/audit'
import { getManageableUrl } from '@/lib/authorization'
import { assessDestination } from '@/lib/link-safety'
import {
  normalizeCountryCodes,
  normalizeReferrerDomain,
  normalizeSafeUrl,
  parseOptionalDate,
} from '@/lib/smart-routing'

const DEVICES = new Set(['mobile', 'tablet', 'desktop', 'bot'])

export async function PATCH(request: NextRequest, context: { params: Promise<{ shortCode: string; ruleId: string }> }) {
  const { shortCode, ruleId } = await context.params
  const auth = await getManageableUrl(request, shortCode)
  if (!auth.url) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const url = auth.url
  const existing = await prisma.linkRule.findFirst({ where: { id: ruleId, urlId: url.id } })
  if (!existing) return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
  try {
    const body = (await request.json()) as Record<string, unknown>
    const patch: Record<string, unknown> = {}

    if (body.name !== undefined) {
      const name = String(body.name).trim()
      if (!name || name.length > 80) throw new Error('Rule name must be 1–80 characters')
      patch.name = name
    }
    if (body.destinationUrl !== undefined) {
      const destinationUrl = normalizeSafeUrl(String(body.destinationUrl))
      const risk = assessDestination(destinationUrl)
      patch.destinationUrl = destinationUrl
      patch.riskStatus = risk.status
      patch.riskReason = risk.reason
      patch.riskCheckedAt = new Date()
    }
    if (body.priority !== undefined) {
      const value = Number(body.priority)
      if (!Number.isInteger(value) || value < 0 || value > 10000) throw new Error('Priority must be 0–10000')
      patch.priority = value
    }
    if (body.weight !== undefined) {
      const value = Number(body.weight)
      if (!Number.isInteger(value) || value < 0 || value > 1000) throw new Error('Weight must be 0–1000')
      patch.weight = value
    }
    if (body.enabled !== undefined) patch.enabled = Boolean(body.enabled)
    if (body.countryCodes !== undefined) patch.countryCodes = normalizeCountryCodes(body.countryCodes)
    if (body.deviceType !== undefined) {
      const value = body.deviceType === '' || body.deviceType === null ? null : String(body.deviceType)
      if (value && !DEVICES.has(value)) throw new Error('Invalid device type')
      patch.deviceType = value
    }
    if (body.referrerDomain !== undefined) patch.referrerDomain = normalizeReferrerDomain(body.referrerDomain)
    if (body.startAt !== undefined) patch.startAt = parseOptionalDate(body.startAt)
    if (body.endAt !== undefined) patch.endAt = parseOptionalDate(body.endAt)

    const startAt = (patch.startAt as Date | null | undefined) ?? existing.startAt
    const endAt = (patch.endAt as Date | null | undefined) ?? existing.endAt
    if (startAt && endAt && endAt <= startAt) throw new Error('End time must be after start time')

    const updated = await prisma.linkRule.update({ where: { id: existing.id }, data: patch })
    await recordAudit(request, { action: 'routing_rule.update', urlId: url.id, resourceType: 'link_rule', resourceId: existing.id, before: { name: existing.name, destinationUrl: existing.destinationUrl, priority: existing.priority, weight: existing.weight, enabled: existing.enabled, countryCodes: existing.countryCodes, deviceType: existing.deviceType, referrerDomain: existing.referrerDomain, startAt: existing.startAt, endAt: existing.endAt }, after: updated })
    return NextResponse.json(updated)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid rule' }, { status: 400 })
  }
}
export async function DELETE(request: NextRequest, context: { params: Promise<{ shortCode: string; ruleId: string }> }) {
  const { shortCode, ruleId } = await context.params
  const auth = await getManageableUrl(request, shortCode)
  if (!auth.url) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const url = auth.url
  const existing = await prisma.linkRule.findFirst({ where: { id: ruleId, urlId: url.id } })
  if (!existing) return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
  await prisma.linkRule.delete({ where: { id: existing.id } })
  await recordAudit(request, { action: 'routing_rule.delete', urlId: url.id, resourceType: 'link_rule', resourceId: existing.id, before: { name: existing.name, destinationUrl: existing.destinationUrl, priority: existing.priority, weight: existing.weight, enabled: existing.enabled } })
  return new NextResponse(null, { status: 204 })
}
