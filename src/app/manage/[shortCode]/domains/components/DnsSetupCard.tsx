'use client'

import { Copy, RefreshCw, TriangleAlert } from 'lucide-react'
import toast from 'react-hot-toast'
import type { DnsRecords } from './types'

async function copyText(text: string) {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      const area = document.createElement('textarea')
      area.value = text
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      document.execCommand('copy')
      document.body.removeChild(area)
    }
    toast.success('Copied to clipboard')
  } catch {
    toast.error('Could not copy to clipboard')
  }
}

function DnsRecordCard({
  type,
  name,
  value,
  desc,
}: {
  type: string
  name: string
  value: string
  desc: string
}) {
  function copy(text: string) {
    void copyText(text)
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-amber-300">{type}</span>
        <span className="text-[10px] text-slate-500">{desc}</span>
      </div>

      <div>
        <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
          <span>Host / Name</span>
          <button onClick={() => copy(name)} className="text-slate-500 hover:text-white">
            <Copy className="h-3 w-3" />
          </button>
        </div>
        <code className="block rounded-lg bg-slate-900 px-2.5 py-1.5 font-mono text-xs text-slate-200 truncate">
          {name}
        </code>
      </div>

      <div>
        <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
          <span>Points to / Value</span>
          <button onClick={() => copy(value)} className="text-slate-500 hover:text-white">
            <Copy className="h-3 w-3" />
          </button>
        </div>
        <code className="block rounded-lg bg-slate-900 px-2.5 py-1.5 font-mono text-xs text-slate-200 truncate">
          {value}
        </code>
      </div>
    </div>
  )
}

export default function DnsSetupCard({
  host,
  dns,
  working,
  onVerify,
}: {
  host: string
  dns: DnsRecords
  working: boolean
  onVerify: () => void
}) {
  return (
    <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 space-y-5 animate-in fade-in duration-200">
      <div className="flex items-start gap-3">
        <TriangleAlert className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <h2 className="font-semibold text-white text-base">Required DNS Records for {host}</h2>
          <p className="text-xs text-slate-400 mt-1">
            Add these records in your DNS provider (Cloudflare, AWS Route53, GoDaddy, Namecheap) to verify domain ownership.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <DnsRecordCard
          type="TXT Record (Verification)"
          name={dns.name}
          value={dns.value}
          desc="Proves domain ownership"
        />
        <DnsRecordCard
          type="CNAME Record (Routing)"
          name={dns.cname.name}
          value={dns.cname.value}
          desc="Routes traffic through QuickLink edge"
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={onVerify}
          disabled={working}
          className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60 transition shadow-lg shadow-amber-500/20"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${working ? 'animate-spin' : ''}`} />
          {working ? 'Checking DNS Propagation…' : 'Verify DNS Ownership'}
        </button>
      </div>
    </section>
  )
}
