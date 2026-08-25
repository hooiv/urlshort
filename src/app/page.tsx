import { headers } from 'next/headers'
import HomeClient from './HomeClient'
import { getBaseUrl } from '@/lib/utils'

export default async function Page() {
  const headersList = await headers()
  const host = headersList.get('host') || ''
  const appHost = new URL(getBaseUrl()).host

  if (host && host !== appHost && !host.includes('localhost')) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-500 font-mono text-sm">
        404 - Not Found
      </div>
    )
  }

  return <HomeClient />
}
