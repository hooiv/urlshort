import { NextRequest, NextResponse } from 'next/server'
import { requireWorkspaceRole } from '@/lib/workspaces'
import { getClientIp } from '@/lib/rate-limit'
import { isExcludedFromAnalytics } from '@/lib/analytics-exclusions'
import { prisma } from '@/lib/prisma'

/** Returns the caller's IP as the server sees it, and whether it is already excluded. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const a = await requireWorkspaceRole(request, workspaceId, ['owner', 'admin', 'analyst'])
  if (!a.membership) return NextResponse.json({ error: a.error }, { status: a.status })
  const ip = getClientIp(request)
  const policy = await prisma.privacyPolicy.findUnique({ where: { workspaceId }, select: { analyticsExclusions: true } })
  const list = (policy?.analyticsExclusions as string[] | null) ?? []
  return NextResponse.json({ ip: ip === 'unknown' ? null : ip, excluded: isExcludedFromAnalytics(ip, list) })
}
