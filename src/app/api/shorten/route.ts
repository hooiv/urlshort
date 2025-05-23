import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateShortCode, isValidUrl, normalizeUrl } from '@/lib/utils'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { url, customCode } = body

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    const normalizedUrl = normalizeUrl(url)
    
    if (!isValidUrl(normalizedUrl)) {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
    }

    // Check if custom code is provided and available
    let shortCode = customCode
    if (customCode) {
      const existing = await prisma.url.findUnique({
        where: { shortCode: customCode }
      })
      if (existing) {
        return NextResponse.json({ error: 'Custom code already exists' }, { status: 400 })
      }
    } else {
      // Generate a unique short code
      do {
        shortCode = generateShortCode()
      } while (await prisma.url.findUnique({ where: { shortCode } }))
    }

    // Try to get page title
    let title = null
    try {
      const response = await fetch(normalizedUrl, { 
        method: 'GET',
        headers: { 'User-Agent': 'URL-Shortener-Bot' }
      })
      const html = await response.text()
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
      if (titleMatch) {
        title = titleMatch[1].trim()
      }
    } catch (error) {
      // If we can't fetch the title, that's okay
      console.log('Could not fetch title:', error)
    }

    const shortUrl = await prisma.url.create({
      data: {
        originalUrl: normalizedUrl,
        shortCode,
        title
      }
    })

    return NextResponse.json({
      id: shortUrl.id,
      originalUrl: shortUrl.originalUrl,
      shortCode: shortUrl.shortCode,
      shortUrl: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/${shortUrl.shortCode}`,
      title: shortUrl.title,
      clicks: shortUrl.clicks,
      createdAt: shortUrl.createdAt
    })

  } catch (error) {
    console.error('Error creating short URL:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const urls = await prisma.url.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50, // Limit to 50 most recent URLs
      include: {
        _count: {
          select: { clickEvents: true }
        }
      }
    })

    return NextResponse.json(urls)
  } catch (error) {
    console.error('Error fetching URLs:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
