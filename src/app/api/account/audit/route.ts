import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request)
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const urlId = new URL(request.url).searchParams.get('urlId')
  const events = await prisma.auditEvent.findMany({
    where: {
      actorUserId: user.id,
      ...(urlId ? { urlId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: { id: true, action: true, actorType: true, resourceType: true, resourceId: true, beforeJson: true, afterJson: true, metadataJson: true, userAgent: true, createdAt: true, urlId: true },
  })
  return NextResponse.json(events)
}
