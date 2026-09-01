import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const apps = await prisma.deepLinkApp.findMany({
    where: { enabled: true, resolverEnabled: true, bundleId: { not: null }, appleTeamId: { not: null } },
    select: { appleTeamId: true, bundleId: true },
  })
  const details = apps.map((app) => ({
    appID: `${app.appleTeamId}.${app.bundleId}`,
    paths: ['*'],
  }))
  return NextResponse.json({ applinks: { apps: [], details } }, {
    headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' },
  })
}
