import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hasValidManagementToken } from '@/lib/management'

export async function DELETE(request: NextRequest, context: { params: Promise<{ shortCode: string; revisionId: string }> }) {
  const { shortCode, revisionId } = await context.params
  const url = await prisma.url.findUnique({ where: { shortCode }, select: { id: true, managementTokenHash: true } })
  if (!url) return NextResponse.json({ error: 'Short link not found' }, { status: 404 })
  if (!hasValidManagementToken(request, url.managementTokenHash)) return NextResponse.json({ error: 'Invalid management token' }, { status: 401 })
  const revision = await prisma.destinationRevision.findFirst({ where: { id: revisionId, urlId: url.id } })
  if (!revision) return NextResponse.json({ error: 'Release not found' }, { status: 404 })
  if (revision.effectiveAt <= new Date()) return NextResponse.json({ error: 'Live releases are immutable; publish a new rollback release instead' }, { status: 409 })
  await prisma.destinationRevision.delete({ where: { id: revision.id } }); const owner = await prisma.url.findUnique({ where: { id: url.id }, select: { workspaceId: true } }); if (owner?.workspaceId) { const { publishWorkspaceRoutingConfig } = await import('@/lib/routing-config'); await publishWorkspaceRoutingConfig(owner.workspaceId) }
  return new NextResponse(null, { status: 204 })
}
