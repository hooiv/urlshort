import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request)
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

  const links = await prisma.url.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' }
  })

  const escapeCsv = (val: string | number | null | undefined) => {
    if (val === null || val === undefined) return ''
    const str = String(val)
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const header = ['ID', 'ShortCode', 'OriginalURL', 'Title', 'Tags', 'Clicks', 'CreatedAt', 'IsActive', 'MaxClicks', 'ExpiresAt', 'PasswordProtected'].join(',')
  
  const rows = links.map(link => {
    return [
      escapeCsv(link.id),
      escapeCsv(link.shortCode),
      escapeCsv(link.originalUrl),
      escapeCsv(link.title),
      escapeCsv(link.tags ? link.tags.join(';') : ''),
      escapeCsv(link.clicks),
      escapeCsv(link.createdAt.toISOString()),
      escapeCsv(link.isActive ? 'true' : 'false'),
      escapeCsv(link.maxClicks),
      escapeCsv(link.expiresAt ? link.expiresAt.toISOString() : ''),
      escapeCsv(link.passwordHash ? 'true' : 'false')
    ].join(',')
  })

  const csv = [header, ...rows].join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="quicklink-export-${new Date().toISOString().split('T')[0]}.csv"`
    }
  })
}
