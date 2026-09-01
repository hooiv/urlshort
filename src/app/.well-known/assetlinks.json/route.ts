import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const apps = await prisma.deepLinkApp.findMany({
    where: { enabled: true, resolverEnabled: true, packageName: { not: null }, androidSha256: { not: null } },
    select: { packageName: true, androidSha256: true },
  })
  const statements = apps.flatMap((app) => {
    const fingerprints = (app.androidSha256 ?? '').split(/[\n,]+/).map((x) => x.trim()).filter(Boolean)
    return fingerprints.length ? [{
      relation: ['delegate_permission/common.handle_all_urls'],
      target: { namespace: 'android_app', package_name: app.packageName, sha256_cert_fingerprints: fingerprints },
    }] : []
  })
  return NextResponse.json(statements, {
    headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' },
  })
}
