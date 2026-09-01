import { publishWorkspaceRoutingConfig } from '@/lib/routing-config'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { recordAudit } from '@/lib/audit'
import { getManageableUrl } from '@/lib/authorization'
import { normalizeSafeUrl, parseOptionalDate } from '@/lib/smart-routing'
import { assertDestinationSafeForStorage } from '@/lib/destination-health'
import { invalidateLink } from '@/lib/link-cache'

async function authorize(request: NextRequest, shortCode: string) {
  const result = await getManageableUrl(request, shortCode)
  if (!result.url) return { response: NextResponse.json({ error: result.error }, { status: result.status }) }
  return { url: result.url }
}

export async function GET(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  const { shortCode } = await context.params
  const auth = await authorize(request, shortCode)
  if ('response' in auth) return auth.response
  const revisions = await prisma.destinationRevision.findMany({
    where: { urlId: auth.url.id },
    orderBy: { effectiveAt: 'desc' },
    take: 50,
  })
  return NextResponse.json(revisions)
}

export async function POST(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  const { shortCode } = await context.params
  const auth = await authorize(request, shortCode)
  if ('response' in auth) return auth.response
  try {
    const body = (await request.json()) as Record<string, unknown>
    const destinationUrl = normalizeSafeUrl(String(body.destinationUrl ?? ''))
    // SSRF guard: new destinations must be publicly routable, same as creation.
    await assertDestinationSafeForStorage(destinationUrl)
    const effectiveAt = parseOptionalDate(body.effectiveAt) ?? new Date()
    if (effectiveAt.getTime() < Date.now() - 60_000) throw new Error('Effective time cannot be more than one minute in the past')
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 200) || null : null
    const latestFuture = await prisma.destinationRevision.findFirst({ where: { urlId: auth.url.id, effectiveAt: { gt: new Date() } }, orderBy: { effectiveAt: 'asc' } })
    if (latestFuture && effectiveAt.getTime() === latestFuture.effectiveAt.getTime() && destinationUrl === latestFuture.destinationUrl) {
      return NextResponse.json({ error: 'An identical release is already scheduled for this time' }, { status: 409 })
    }
    const revision = await prisma.destinationRevision.create({ data: { urlId: auth.url.id, destinationUrl, effectiveAt, reason } })
    await invalidateLink(auth.url.shortCode, auth.url.id)
    if (auth.url.workspaceId) await publishWorkspaceRoutingConfig(auth.url.workspaceId)
    await recordAudit(request, { action: 'destination_release.create', urlId: auth.url.id, resourceType: 'destination_revision', resourceId: revision.id, after: { destinationUrl, effectiveAt, reason } })
    return NextResponse.json(revision, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid release' }, { status: 400 })
  }
}
