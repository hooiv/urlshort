import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: { shortCode: string } }
) {
  try {
    const { shortCode } = params

    const url = await prisma.url.findUnique({
      where: { shortCode },
      include: {
        clickEvents: {
          orderBy: { createdAt: 'desc' },
          take: 100
        }
      }
    })

    if (!url) {
      return NextResponse.json({ error: 'URL not found' }, { status: 404 })
    }

    // Calculate analytics
    const clickEvents = url.clickEvents
    const totalClicks = clickEvents.length
    
    // Group clicks by date
    const clicksByDate = clickEvents.reduce((acc, click) => {
      const date = click.createdAt.toISOString().split('T')[0]
      acc[date] = (acc[date] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    // Group clicks by country
    const clicksByCountry = clickEvents.reduce((acc, click) => {
      const country = click.country || 'Unknown'
      acc[country] = (acc[country] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    // Group clicks by referrer
    const clicksByReferrer = clickEvents.reduce((acc, click) => {
      const referrer = click.referer ? new URL(click.referer).hostname : 'Direct'
      acc[referrer] = (acc[referrer] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    return NextResponse.json({
      url: {
        id: url.id,
        originalUrl: url.originalUrl,
        shortCode: url.shortCode,
        title: url.title,
        clicks: url.clicks,
        createdAt: url.createdAt
      },
      analytics: {
        totalClicks,
        clicksByDate,
        clicksByCountry,
        clicksByReferrer,
        recentClicks: clickEvents.slice(0, 10).map(click => ({
          createdAt: click.createdAt,
          country: click.country,
          referrer: click.referer ? new URL(click.referer).hostname : 'Direct'
        }))
      }
    })

  } catch (error) {
    console.error('Error fetching analytics:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
