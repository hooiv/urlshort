'use client'

import { useEffect, useState } from 'react'
import { Zap } from 'lucide-react'
import type { DnsProviderId } from './types'

const PROVIDERS: Record<DnsProviderId, { label: string; tokenHelp: string; tokenUrl: string }> = {
  cloudflare: {
    label: 'Cloudflare',
    tokenHelp: 'Create a token with the "Edit zone DNS" template, limited to this zone.',
    tokenUrl: 'https://dash.cloudflare.com/profile/api-tokens',
  },
  vercel: {
    label: 'Vercel',
    tokenHelp: 'Create a token scoped to the team that owns the domain. Delete it afterwards if you like.',
    tokenUrl: 'https://vercel.com/account/settings/tokens',
  },
}

/**
 * One-click alternative to copying records by hand. The token is sent once
 * for this request and is never stored.
 */
export default function AutoConnectCard({
  host,
  working,
  detectProvider,
  connectDns,
}: {
  host: string
  working: boolean
  detectProvider: () => Promise<DnsProviderId | null>
  connectDns: (input: { provider: DnsProviderId; apiToken: string; teamId?: string; replaceExisting?: boolean }) => Promise<'verified' | 'pending' | 'conflict' | 'failed'>
}) {
  const [provider, setProvider] = useState<DnsProviderId>('cloudflare')
  const [detected, setDetected] = useState<DnsProviderId | null>(null)
  const [apiToken, setApiToken] = useState('')
  const [teamId, setTeamId] = useState('')
  const [conflict, setConflict] = useState(false)

  useEffect(() => {
    let active = true
    void detectProvider().then((found) => {
      if (!active || !found) return
      setDetected(found)
      setProvider(found)
    })
    return () => {
      active = false
    }
    // Re-detect only when the host changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host])

  async function submit(replaceExisting: boolean) {
    const outcome = await connectDns({ provider, apiToken: apiToken.trim(), teamId: teamId.trim() || undefined, replaceExisting })
    setConflict(outcome === 'conflict')
    if (outcome !== 'conflict' && outcome !== 'failed') setApiToken('')
  }

  const info = PROVIDERS[provider]
  return (
    <section className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-6 space-y-4">
      <div className="flex items-start gap-3">
        <Zap className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
        <div>
          <h2 className="font-semibold text-white text-base">Connect automatically</h2>
          <p className="text-xs text-slate-400 mt-1">
            {detected ? `${host} uses ${PROVIDERS[detected].label} DNS. ` : ''}
            We add both records for you and verify as soon as they resolve. The token is used once and never stored.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
        <select
          value={provider}
          onChange={(e) => { setProvider(e.target.value as DnsProviderId); setConflict(false) }}
          className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
          aria-label="DNS provider"
        >
          <option value="cloudflare">Cloudflare</option>
          <option value="vercel">Vercel</option>
        </select>
        <input
          type="password"
          autoComplete="off"
          value={apiToken}
          onChange={(e) => setApiToken(e.target.value)}
          placeholder={`${info.label} API token`}
          className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-sm"
        />
      </div>
      {provider === 'vercel' && (
        <input
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          placeholder="Team ID (only if the domain belongs to a team)"
          className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
        />
      )}
      <p className="text-xs text-slate-500">
        {info.tokenHelp}{' '}
        <a href={info.tokenUrl} target="_blank" rel="noreferrer" className="text-blue-300 hover:underline">Create one</a>
      </p>

      {conflict ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200 space-y-2">
          <p>{host} currently points to another service. Replacing it sends that traffic to QuickLink instead.</p>
          <button onClick={() => void submit(true)} disabled={working} className="rounded-lg bg-amber-500 px-3 py-1.5 font-semibold text-slate-950 disabled:opacity-60">
            Replace and connect
          </button>
        </div>
      ) : (
        <button
          onClick={() => void submit(false)}
          disabled={working || apiToken.trim().length < 20}
          className="rounded-xl bg-blue-500 px-5 py-2.5 text-xs font-semibold text-white hover:bg-blue-400 disabled:opacity-60"
        >
          {working ? 'Configuring…' : `Connect with ${info.label}`}
        </button>
      )}
    </section>
  )
}
