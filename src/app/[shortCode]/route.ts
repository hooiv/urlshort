import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: { shortCode: string } }
) {
  try {
    const { shortCode } = params

    const url = await prisma.url.findUnique({
      where: { shortCode }
    })

    if (!url || !url.isActive) {
      return NextResponse.redirect(new URL('/404', request.url))
    }    // Check if URL has expired
    if (url.expiresAt && new Date() > url.expiresAt) {
      return NextResponse.redirect(new URL('/expired', request.url))
    }

    // Get client info for analytics
    const forwarded = request.headers.get('x-forwarded-for')
    const ip = forwarded ? forwarded.split(',')[0].trim() : request.headers.get('x-real-ip') || 'unknown'
    const userAgent = request.headers.get('user-agent')
    const referer = request.headers.get('referer')

    // Record click event and increment counter
    await Promise.all([
      prisma.clickEvent.create({
        data: {
          urlId: url.id,
          ip,
          userAgent,
          referer
        }
      }),
      prisma.url.update({
        where: { id: url.id },
        data: { clicks: { increment: 1 } }
      })
    ])

    return NextResponse.redirect(url.originalUrl)

  } catch (error) {
    console.error('Error redirecting:', error)
    return NextResponse.redirect(new URL('/error', request.url))
  }
}
