import { NextRequest, NextResponse, after } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashVisitorId } from '@/lib/attribution'
import { getDeviceType, getOperatingSystem, getBrowser, getTrafficSource, getVisitorId } from '@/lib/smart-routing'
import { rateLimit } from '@/lib/rate-limit'
import { enforceUsage } from '@/lib/tenant-usage'
import { sanitizeAnalyticsMetadata } from '@/lib/privacy-ingestion'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ handle: string }> }
) {
  try {
    const limit = await rateLimit(request, { name: 'bio-track', limit: 300, windowMs: 60_000 })
    if (!limit.allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    const { handle } = await context.params
    const profile = await prisma.bioProfile.findUnique({
      where: { handle: handle.toLowerCase() },
      select: { id: true, handle: true, workspaceId: true },
    })

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const body = await request.json().catch(() => ({}))
    const eventType = body.event === 'click' ? 'bio.click' : 'bio.view'
    const blockId = typeof body.blockId === 'string' ? body.blockId : null

    const visitor = getVisitorId(request)
    const visitorIdHash = hashVisitorId(visitor.id)
    const userAgent = request.headers.get('user-agent') || ''
    const deviceType = getDeviceType(userAgent)
    const os = getOperatingSystem(userAgent)
    const browser = getBrowser(userAgent)
    const referrer = request.headers.get('referer') || ''
    let referrerHost: string | null = null
    try {
      if (referrer) referrerHost = new URL(referrer).hostname.replace(/^www\./, '')
    } catch {
      referrerHost = null
    }
    const { channel, sourceName } = getTrafficSource(referrerHost)

    if (profile.workspaceId) {
      const usage = await enforceUsage(request, profile.workspaceId, 'api_requests')
      if (!usage.allowed) return NextResponse.json({ error: 'Usage quota exceeded' }, { status: 429 })
    }
    const rawMetadata: Record<string, unknown> = {
      handle: profile.handle, blockId, deviceType, os, browser, referrerHost, channel, sourceName,
      visitorIdHash,
    }
    const eventMetadata = profile.workspaceId ? await sanitizeAnalyticsMetadata(profile.workspaceId, rawMetadata) : rawMetadata

    // Run recording in background with Next.js `after`
    after(async () => {
      try {
        // Record AuditEvent for time-series analytics
        await prisma.auditEvent.create({
          data: {
            action: eventType,
            actorType: 'visitor',
            resourceType: blockId ? 'bio_block' : 'bio_profile',
            resourceId: blockId || profile.id,
            ipHash: visitorIdHash,
            userAgent,
            metadataJson: JSON.stringify({
              ...eventMetadata,
              timestamp: new Date().toISOString(),
            }),
          },
        })

        // If it's a block click, update the block's metadataJson click counter
        if (eventType === 'bio.click' && blockId) {
          const block = await prisma.bioBlock.findFirst({
            where: { id: blockId, profileId: profile.id },
            select: { id: true, metadataJson: true },
          })

          if (block) {
            let meta: Record<string, unknown> = {}
            try {
              if (block.metadataJson) meta = JSON.parse(block.metadataJson)
            } catch {
              meta = {}
            }
            const currentClicks = typeof meta.clicks === 'number' ? meta.clicks : 0
            meta.clicks = currentClicks + 1

            await prisma.bioBlock.update({
              where: { id: block.id },
              data: { metadataJson: JSON.stringify(meta) },
            })
          }
        }
      } catch (err) {
        console.error('Bio tracking error:', err)
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Bio track error:', error)
    return NextResponse.json({ error: 'Tracking failed' }, { status: 500 })
  }
}
