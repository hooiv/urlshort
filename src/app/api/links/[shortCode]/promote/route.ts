import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getManageableUrl, EDIT_ROLES } from '@/lib/authorization'
import { recordAudit } from '@/lib/audit'
import { invalidateLink } from '@/lib/link-cache'
import { assertDestinationSafeForStorage } from '@/lib/destination-health'
import { rateLimit } from '@/lib/rate-limit'

export const promoteSchema = z.object({
  ruleId: z.string().trim().min(1, { message: 'ruleId is required' }).max(100),
})

export async function POST(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  try {
    const { shortCode } = await context.params
    const access = await getManageableUrl(request, shortCode, EDIT_ROLES)
    if (!access.url) return NextResponse.json({ error: access.error }, { status: access.status })
    const link = access.url

    const probeLimit = await rateLimit(request, { name: 'promote', identifier: link.id, limit: 10, windowMs: 60_000 })
    if (!probeLimit.allowed) return NextResponse.json({ error: 'Too many promotion requests. Try again shortly.' }, { status: 429, headers: { 'Retry-After': String(probeLimit.retryAfterSeconds) } })

    const parsedBody = promoteSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsedBody.success) {
      return NextResponse.json({ error: parsedBody.error.issues[0]?.message || 'ruleId is required' }, { status: 400 })
    }
    const ruleId = parsedBody.data.ruleId

    const rule = await prisma.linkRule.findUnique({
      where: { id: ruleId, urlId: link.id },
    })
    if (!rule) {
      return NextResponse.json({ error: 'Routing rule not found for this link' }, { status: 404 })
    }

    try {
      await assertDestinationSafeForStorage(rule.destinationUrl)
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Promoted destination is not allowed' },
        { status: 400 },
      )
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Record new destination revision
      await tx.destinationRevision.create({
        data: {
          urlId: link.id,
          destinationUrl: rule.destinationUrl,
          reason: `Promoted winning experiment variant "${rule.name}" to default destination`,
          effectiveAt: new Date(),
        },
      })

      // Update the main destination URL
      return tx.url.update({
        where: { id: link.id },
        data: { originalUrl: rule.destinationUrl },
        select: { id: true, shortCode: true, originalUrl: true, title: true },
      })
    })

    await invalidateLink(updated.shortCode, updated.id); if (link.workspaceId) { const { publishWorkspaceRoutingConfig } = await import('@/lib/routing-config'); await publishWorkspaceRoutingConfig(link.workspaceId) }
    await recordAudit(request, {
      action: 'link.promote_variant',
      urlId: updated.id,
      resourceType: 'url',
      resourceId: updated.id,
      before: { originalUrl: link.originalUrl },
      after: { originalUrl: updated.originalUrl, promotedRuleId: rule.id, promotedRuleName: rule.name },
    })

    return NextResponse.json({
      success: true,
      promotedRule: { id: rule.id, name: rule.name, destinationUrl: rule.destinationUrl },
      newDestinationUrl: updated.originalUrl,
    })
  } catch (error) {
    console.error('Variant promotion failed:', error)
    return NextResponse.json({ error: 'Failed to promote variant' }, { status: 500 })
  }
}
