import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getDomainFallbacks } from '@/lib/domain-settings'
import HomeClient from './HomeClient'
import { getBaseUrl } from '@/lib/utils'

export default async function Page() {
  const headersList = await headers()
  const host = headersList.get('host') || ''
  const appHost = new URL(getBaseUrl()).host

  if (host && host !== appHost && !host.includes('localhost')) {
    const fallbacks = await getDomainFallbacks(host.toLowerCase().replace(/:\d+$/, '').replace(/^www\./, '')).catch(() => null)
    if (fallbacks?.rootRedirectUrl) redirect(fallbacks.rootRedirectUrl)
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-500 font-mono text-sm">
        404 - Not Found
      </div>
    )
  }

  return <HomeClient />
}
