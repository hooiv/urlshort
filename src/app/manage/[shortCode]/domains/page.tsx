'use client'

import { useParams } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { Toaster } from 'react-hot-toast'
import AccessDenied from '@/app/manage/[shortCode]/domains/components/AccessDenied'
import BindingList from '@/app/manage/[shortCode]/domains/components/BindingList'
import DnsSetupCard from '@/app/manage/[shortCode]/domains/components/DnsSetupCard'
import DomainForm from '@/app/manage/[shortCode]/domains/components/DomainForm'
import DomainsHeader from '@/app/manage/[shortCode]/domains/components/DomainsHeader'
import { useDomains } from '@/app/manage/[shortCode]/domains/components/useDomains'

export default function BrandedDomainsPage() {
  const { shortCode } = useParams<{ shortCode: string }>()
  const {
    token,
    host,
    path,
    bindings,
    dns,
    working,
    handleHostChange,
    handlePathChange,
    addDomain,
    verify,
    remove,
  } = useDomains(shortCode)

  if (!token) return <AccessDenied shortCode={shortCode} />

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20">
      <Toaster position="top-right" />

      <DomainsHeader shortCode={shortCode} />

      <main className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        {/* Banner */}
        <section className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-6">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-400">
            <ShieldCheck className="h-4 w-4" /> Enterprise Brand Identity
          </div>
          <h1 className="mt-2 text-2xl font-bold text-white">
            Use your own branded domain. Keep all smart routing.
          </h1>
          <p className="mt-2 text-sm text-slate-400 max-w-3xl leading-relaxed">
            Connect any custom hostname (e.g. <code className="font-mono text-blue-300">go.yourcompany.com</code>), verify DNS ownership, and serve short links from your primary brand with zero infrastructure management.
          </p>
        </section>

        {/* Add Domain Form */}
        <DomainForm
          host={host}
          path={path}
          working={working}
          shortCode={shortCode}
          onHostChange={handleHostChange}
          onPathChange={handlePathChange}
          onSubmit={(event) => void addDomain(event)}
        />

        {/* DNS Configuration Cards */}
        {dns && (
          <DnsSetupCard
            host={host}
            dns={dns}
            working={working}
            onVerify={() => void verify()}
          />
        )}

        {/* Connected Domains List */}
        <BindingList bindings={bindings} shortCode={shortCode} onRemove={(binding) => void remove(binding)} />
      </main>
    </div>
  )
}
