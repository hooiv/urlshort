import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { prisma } from '@/lib/prisma'
import { getManageableUrl, READ_ROLES } from '@/lib/authorization'
import { getBaseUrl } from '@/lib/utils'
import { rateLimit } from '@/lib/rate-limit'

const ICONS_SVG: Record<string, string> = {
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  twitter: '<path d="M4 4l11.733 16h4.267l-11.733 -16z"/><path d="M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  github: '<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  youtube: '<path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><polygon points="10 15 15 12 10 9 10 15" fill="currentColor"/>',
  instagram: '<rect width="20" height="20" x="2" y="2" rx="5" ry="5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" fill="none" stroke="currentColor" stroke-width="2"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5" stroke="currentColor" stroke-width="2"/>',
  linkedin: '<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" fill="none" stroke="currentColor" stroke-width="2"/><rect width="4" height="12" x="2" y="9" fill="currentColor"/><circle cx="4" cy="4" r="2" fill="currentColor"/>',
  cart: '<circle cx="8" cy="21" r="1" fill="currentColor"/><circle cx="19" cy="21" r="1" fill="currentColor"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  globe: '<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" fill="none" stroke="currentColor" stroke-width="2"/><path d="M2 12h20" stroke="currentColor" stroke-width="2"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="currentColor"/>',
}

/**
 * GET /api/links/[shortCode]/qr?format=png|svg&size=512&margin=2&dark=#000000&light=#ffffff&level=H&icon=link
 */
export async function GET(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  try {
    const limit = await rateLimit(request, { name: 'qr', limit: 60, windowMs: 60_000 })
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    const { shortCode } = await context.params
    const access = await getManageableUrl(request, shortCode, READ_ROLES)
    if (!access.url) return NextResponse.json({ error: access.error }, { status: access.status })

    const url = await prisma.url.findUnique({ where: { id: access.url.id }, select: { shortCode: true, isActive: true } })
    if (!url) return NextResponse.json({ error: 'URL not found' }, { status: 404 })

    const params = request.nextUrl.searchParams
    const format = params.get('format') === 'svg' ? 'svg' : 'png'
    const size = Math.min(Math.max(Number(params.get('size')) || 512, 128), 4096)
    const margin = Math.min(Math.max(Number(params.get('margin')) || 2, 0), 10)
    const dark = /^#[0-9a-fA-F]{6}$/.test(params.get('dark') || '') ? (params.get('dark') as string) : '#0f172a'
    const light = /^#[0-9a-fA-F]{6}$/.test(params.get('light') || '') ? (params.get('light') as string) : '#ffffff'
    const icon = params.get('icon')?.toLowerCase() || ''
    const shouldDownload = params.get('download') === '1' || params.get('download') === 'true'

    const levelParam = (params.get('level') || (icon ? 'H' : 'M')).toUpperCase()
    const errorCorrectionLevel = ['L', 'M', 'Q', 'H'].includes(levelParam)
      ? (levelParam as 'L' | 'M' | 'Q' | 'H')
      : icon
        ? 'H'
        : 'M'

    const target = `${getBaseUrl()}/${url.shortCode}`
    const options = {
      width: size,
      margin,
      errorCorrectionLevel,
      color: { dark, light },
    }

    const disposition = shouldDownload
      ? `attachment; filename="quicklink-${encodeURIComponent(url.shortCode)}-qr.${format}"`
      : 'inline'

    if (format === 'svg') {
      let svg = await QRCode.toString(target, { ...options, type: 'svg' })

      // Embed center icon badge if requested
      if (icon && ICONS_SVG[icon]) {
        const badgeSize = Math.round(size * 0.22)
        const badgePos = Math.round((size - badgeSize) / 2)
        const iconSize = Math.round(badgeSize * 0.6)
        const iconPos = Math.round((size - iconSize) / 2)
        const badgeRadius = Math.round(badgeSize * 0.25)

        const iconInjection = `
  <!-- QuickLink Center Icon Badge -->
  <rect x="${badgePos}" y="${badgePos}" width="${badgeSize}" height="${badgeSize}" rx="${badgeRadius}" fill="${light}" stroke="${dark}" stroke-width="2" />
  <g transform="translate(${iconPos}, ${iconPos}) scale(${iconSize / 24})" color="${dark}">
    ${ICONS_SVG[icon]}
  </g>
</svg>`
        svg = svg.replace('</svg>', iconInjection)
      }

      return new NextResponse(svg, {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Content-Disposition': disposition,
          'Cache-Control': 'private, max-age=300',
        },
      })
    }

    const buffer = await QRCode.toBuffer(target, { ...options, type: 'png' })
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': disposition,
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (error) {
    console.error('QR generation failed:', error)
    return NextResponse.json({ error: 'Could not generate QR code' }, { status: 500 })
  }
}
