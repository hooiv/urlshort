import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { recordAudit } from '@/lib/audit'
import { getManageableUrl } from '@/lib/authorization'
import { publishWorkspaceRoutingConfig } from '@/lib/routing-config'

export async function GET(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  const { shortCode } = await context.params
  const access = await getManageableUrl(request, shortCode)
  if (!access.url) return NextResponse.json({ error: access.error }, { status: access.status })
  const [url, reports] = await Promise.all([
    prisma.url.findUnique({ where: { id: access.url.id }, select: { riskStatus: true, riskReason: true, riskCheckedAt: true } }),
    prisma.abuseReport.findMany({ where: { urlId: access.url.id }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, reason: true, details: true, status: true, createdAt: true } }),
  ])
  return NextResponse.json({ url, reports })
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  const { shortCode } = await context.params
  const access = await getManageableUrl(request, shortCode)
  if (!access.url) return NextResponse.json({ error: access.error }, { status: access.status })
  try {
    const body = (await request.json()) as Record<string, unknown>
    if (!['cleared', 'review', 'blocked'].includes(String(body.riskStatus))) return NextResponse.json({ error: 'Invalid safety status' }, { status: 400 })
    const updated = await prisma.url.update({ where: { id: access.url.id }, data: { riskStatus: String(body.riskStatus) as 'cleared' | 'review' | 'blocked', riskReason: typeof body.reason === 'string' ? body.reason.slice(0, 500) : access.url.riskReason, riskCheckedAt: new Date() } })
    if (access.url.workspaceId) await publishWorkspaceRoutingConfig(access.url.workspaceId)
    await recordAudit(request, { action: 'link.safety.update', urlId: access.url.id, resourceType: 'url_safety', resourceId: access.url.id, before: { riskStatus: access.url.riskStatus, riskReason: access.url.riskReason }, after: { riskStatus: updated.riskStatus, riskReason: updated.riskReason } })
    return NextResponse.json({ riskStatus: updated.riskStatus, riskReason: updated.riskReason, riskCheckedAt: updated.riskCheckedAt })
  } catch {
    return NextResponse.json({ error: 'Could not update safety status' }, { status: 400 })
  }
}
