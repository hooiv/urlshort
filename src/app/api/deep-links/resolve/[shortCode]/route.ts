import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getOperatingSystem } from '@/lib/smart-routing'
import { versionAtLeast } from '@/lib/deep-link'

export async function GET(request: NextRequest, { params }: { params: Promise<{ shortCode: string }> }) {
  const { shortCode } = await params
  const url = await prisma.url.findUnique({ where: { shortCode }, include: { deepLinkApp: true } })
  if (!url?.deepLinkApp || !url.deepLinkApp.enabled) return NextResponse.json({ error: 'Deep-link app is not configured' }, { status: 404 })
  const app = url.deepLinkApp
  const os = getOperatingSystem(request.headers.get('user-agent') || '')
  const requestedEnvironment=(request.nextUrl.searchParams.get('environment')||request.headers.get('x-deeplink-environment')||'production').trim().toLowerCase()
  if (requestedEnvironment !== app.environment.toLowerCase()) return NextResponse.json({platform:os,environment:app.environment,action:'web',reason:'environment_mismatch',url:url.originalUrl,webUrl:url.originalUrl,storeUrl:os==='ios'?app.iosStoreUrl:app.androidStoreUrl})
  const clientVersion=request.nextUrl.searchParams.get('appVersion')||request.headers.get('x-app-version')
  const versionAllowed=versionAtLeast(clientVersion,app.minimumAppVersion)
  const schemePrefix=os==='ios'?app.iosResolverScheme:os==='android'?app.androidResolverScheme:null
  const nativeTarget=schemePrefix ? `${schemePrefix}://${url.shortCode}` : (!url.originalUrl.startsWith('http') ? url.originalUrl : null)
  const web=url.originalUrl.startsWith('http')?url.originalUrl:(os==='ios'?app.iosStoreUrl:app.androidStoreUrl)||'/'
  if ((os==='ios'||os==='android') && app.resolverEnabled && versionAllowed && nativeTarget) {
    return NextResponse.json({platform:os,environment:app.environment,appVersion:app.appVersion,minimumAppVersion:app.minimumAppVersion,action:'open',url:nativeTarget,storeUrl:os==='ios'?app.iosStoreUrl:app.androidStoreUrl,webUrl:web})
  }
  return NextResponse.json({platform:os,environment:app.environment,appVersion:app.appVersion,minimumAppVersion:app.minimumAppVersion,action:'web',reason:!app.resolverEnabled?'resolver_disabled':!versionAllowed?'app_version_unsupported':'native_target_unconfigured',url:web,storeUrl:os==='ios'?app.iosStoreUrl:app.androidStoreUrl,webUrl:web})
}
