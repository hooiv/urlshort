import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ handle: string }> }
) {
  try {
    const limit = await rateLimit(request, { name: 'bio-analytics', limit: 120, windowMs: 60_000 })
    if (!limit.allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    const { handle } = await context.params
    const profile = await prisma.bioProfile.findUnique({
      where: { handle: handle.toLowerCase() },
      include: {
        blocks: {
          orderBy: { position: 'asc' },
        },
      },
    })

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Fetch AuditEvents for this profile
    const events = await prisma.auditEvent.findMany({
      where: {
        action: { in: ['bio.view', 'bio.click'] },
        OR: [
          { resourceId: profile.id },
          { resourceId: { in: profile.blocks.map((b) => b.id) } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
      select: {
        id: true,
        action: true,
        resourceId: true,
        createdAt: true,
        metadataJson: true,
      },
    })

    let totalViews = 0
    let totalClicks = 0
    const clicksByBlock: Record<string, number> = {}
    const deviceMap: Record<string, number> = {}
    const referrerMap: Record<string, number> = {}
    const osMap: Record<string, number> = {}
    const browserMap: Record<string, number> = {}

    for (const event of events) {
      let meta: Record<string, unknown> = {}
      try {
        if (event.metadataJson) meta = JSON.parse(event.metadataJson)
      } catch {
        // ignore
      }

      if (event.action === 'bio.view') {
        totalViews += 1
      } else if (event.action === 'bio.click') {
        totalClicks += 1
        const bId = (meta.blockId as string) || event.resourceId || 'unknown'
        clicksByBlock[bId] = (clicksByBlock[bId] || 0) + 1
      }

      const dev = (meta.deviceType as string) || 'desktop'
      deviceMap[dev] = (deviceMap[dev] || 0) + 1

      const ref = (meta.sourceName as string) || 'Direct'
      referrerMap[ref] = (referrerMap[ref] || 0) + 1

      const os = (meta.os as string) || 'other'
      osMap[os] = (osMap[os] || 0) + 1

      const browser = (meta.browser as string) || 'other'
      browserMap[browser] = (browserMap[browser] || 0) + 1
    }

    // Also parse block metadata clicks if stored directly
    const blockStats = profile.blocks.map((b) => {
      let metaClicks = 0
      try {
        if (b.metadataJson) {
          const parsed = JSON.parse(b.metadataJson)
          if (typeof parsed.clicks === 'number') metaClicks = parsed.clicks
        }
      } catch {
        // ignore
      }
      const eventClicks = clicksByBlock[b.id] || 0
      const clicks = Math.max(metaClicks, eventClicks)

      return {
        id: b.id,
        type: b.type,
        title: b.title || b.url || `${b.type} block`,
        url: b.url,
        clicks,
        ctr: totalViews > 0 ? Number(((clicks / totalViews) * 100).toFixed(1)) : 0,
      }
    })

    const ctr = totalViews > 0 ? Number(((totalClicks / totalViews) * 100).toFixed(1)) : 0

    return NextResponse.json({
      profile: {
        id: profile.id,
        handle: profile.handle,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        theme: profile.theme,
      },
      metrics: {
        totalViews,
        totalClicks,
        ctr,
        blockStats,
        devices: Object.entries(deviceMap).map(([device, count]) => ({
          device,
          count,
          percentage: (totalViews + totalClicks) > 0 ? Number(((count / (totalViews + totalClicks)) * 100).toFixed(1)) : 0,
        })),
        referrers: Object.entries(referrerMap).map(([referrer, count]) => ({
          referrer,
          count,
          percentage: (totalViews + totalClicks) > 0 ? Number(((count / (totalViews + totalClicks)) * 100).toFixed(1)) : 0,
        })).sort((a, b) => b.count - a.count),
        osBreakdown: Object.entries(osMap).map(([os, count]) => ({ os, count })),
        browserBreakdown: Object.entries(browserMap).map(([browser, count]) => ({ browser, count })),
        recentActivity: events.slice(0, 20).map((e) => {
          let m: Record<string, unknown> = {}
          try { if (e.metadataJson) m = JSON.parse(e.metadataJson) } catch { /* ignore */ }
          return {
            id: e.id,
            action: e.action === 'bio.view' ? 'Profile View' : 'Link Click',
            timestamp: e.createdAt,
            device: m.deviceType || 'desktop',
            referrer: m.sourceName || 'Direct',
            os: m.os || 'unknown',
          }
        }),
      },
    })
  } catch (error) {
    console.error('Bio analytics error:', error)
    return NextResponse.json({ error: 'Failed to fetch bio analytics' }, { status: 500 })
  }
}