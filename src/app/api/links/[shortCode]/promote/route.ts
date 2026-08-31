import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getManageableUrl, EDIT_ROLES } from '@/lib/authorization'
import { recordAudit } from '@/lib/audit'
import { invalidateLink } from '@/lib/link-cache'
import { assertDestinationSafeForStorage } from '@/lib/destination-health'

export async function POST(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  try {
    const { shortCode } = await context.params
    const access = await getManageableUrl(request, shortCode, EDIT_ROLES)
    if (!access.url) return NextResponse.json({ error: access.error }, { status: access.status })
    const link = access.url

    const body = await request.json()
    const ruleId = typeof body.ruleId === 'string' ? body.ruleId.trim() : ''

    if (!ruleId) {
      return NextResponse.json({ error: 'ruleId is required' }, { status: 400 })
    }

    const rule = await prisma.linkRule.findUnique({
      where: { id: ruleId, urlId: link.id },
    })
    if (!rule) {
      return NextResponse.json({ error: 'Routing rule not found for this link' }, { status: 404 })
    }

    await assertDestinationSafeForStorage(rule.destinationUrl)

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

    await invalidateLink(updated.shortCode, updated.id)
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to promote variant' },
      { status: 500 }
    )
  }
}
