import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { buildAasaManifest } from './components/aasa-logic'

export async function GET() {
  // In a real multi-tenant app, this might dynamically fetch the App IDs associated
  // with a custom domain. For QuickLink's default domain, we serve a static manifest
  // when no enabled deep-link apps are configured.
  try {
    const apps = await prisma.deepLinkApp.findMany({
      where: { enabled: true },
      select: { bundleId: true, appleTeamId: true, iosAssociatedDomainsJson: true },
    })
    const aasa = buildAasaManifest(apps)
    return NextResponse.json(aasa, {
      headers: {
        'Content-Type': 'application/json',
        // AASA files often require no-cache or specific cache controls
        'Cache-Control': 's-maxage=86400, stale-while-revalidate',
      },
    })
  } catch {
    // Never 500 the AASA endpoint (iOS treats failures as "no association"):
    // serve the static fallback manifest instead.
    return NextResponse.json(buildAasaManifest([]), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=86400, stale-while-revalidate',
      },
    })
  }
}
