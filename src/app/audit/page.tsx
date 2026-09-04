'use client'

import Link from 'next/link'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { AuditList } from './components/AuditList'
import { AuditSearch } from './components/AuditSearch'
import { useAuditLog } from './components/useAuditLog'

export default function AuditPage() {
  const { events, search, setSearch, loading, error, reload } = useAuditLog()

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/account"
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Account
        </Link>
        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-blue-300">
              <ShieldCheck className="h-5 w-5" />
              Audit log
            </div>
            <h1 className="mt-2 text-3xl font-semibold">Account activity</h1>
            <p className="mt-2 text-sm text-slate-500">
              Searchable, append-only operational history. IP addresses are hashed.
            </p>
          </div>
          <AuditSearch value={search} onChange={setSearch} onSubmit={reload} />
        </div>
        <section className="mt-8 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70">
          <AuditList loading={loading} error={error} events={events} onRetry={reload} />
        </section>
      </div>
    </main>
  )
}
