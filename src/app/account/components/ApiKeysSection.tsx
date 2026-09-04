'use client'

import Link from 'next/link'
import { Copy, KeyRound } from 'lucide-react'
import toast from 'react-hot-toast'
import CardAction from '@/app/account/components/CardAction'
import { useApiKeys } from '@/app/account/components/useApiKeys'

export default function ApiKeysSection() {
  const { keys, newKeyName, setNewKeyName, createdKey, busy, createKey, revokeKey, dismissCreatedKey } = useApiKeys()

  async function copyCreatedKey() {
    if (!createdKey) return
    try {
      await navigator.clipboard.writeText(createdKey)
      toast.success('Copied')
    } catch {
      toast.error('Clipboard failed')
    }
  }

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <div className="mb-5 flex items-center gap-3">
        <KeyRound className="h-5 w-5 text-violet-300" />
        <div>
          <h2 className="font-semibold">API keys</h2>
          <p className="text-xs text-slate-500">
            Programmatic access — send as <code className="text-slate-400">x-api-key</code> or{' '}
            <code className="text-slate-400">Authorization: Bearer</code>. See the{' '}
            <Link
              href="/status"
              className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:border-slate-500"
            >
              Status
            </Link>
            <Link href="/api-docs" className="text-blue-300 underline">
              API reference
            </Link>
            .
          </p>
        </div>
      </div>
      {createdKey && (
        <div className="mb-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <p className="text-xs font-semibold text-emerald-300">Copy your key now — it is shown only once</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-slate-950 px-3 py-2 font-mono text-xs text-emerald-200">
              {createdKey}
            </code>
            <button
              onClick={() => void copyCreatedKey()}
              className="rounded-lg border border-slate-700 px-3 py-2 text-xs hover:border-slate-500"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
          <button onClick={dismissCreatedKey} className="mt-2 text-xs text-slate-500 hover:text-slate-300">
            Done — hide
          </button>
        </div>
      )}
      <form onSubmit={(e) => void createKey(e)} className="flex flex-col gap-3 sm:flex-row">
        <input
          value={newKeyName}
          onChange={(e) => setNewKeyName(e.target.value)}
          maxLength={80}
          placeholder="Key name (e.g. zapier-integration)"
          className="input flex-1"
        />
        <button
          disabled={busy}
          className="rounded-xl bg-violet-500 px-5 py-2.5 text-sm font-semibold hover:bg-violet-400 disabled:opacity-60"
        >
          Create key
        </button>
      </form>
      {keys.length > 0 && (
        <div className="mt-5 divide-y divide-slate-800">
          {keys.map((apiKey) => (
            <div key={apiKey.id} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {apiKey.name}
                  {apiKey.revokedAt ? (
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-500">revoked</span>
                  ) : null}
                </div>
                <div className="mt-0.5 font-mono text-xs text-slate-600">
                  {apiKey.prefix}… · created {new Date(apiKey.createdAt).toLocaleDateString()}
                  {apiKey.lastUsedAt
                    ? ` · last used ${new Date(apiKey.lastUsedAt).toLocaleDateString()}`
                    : ' · never used'}
                </div>
              </div>
              {!apiKey.revokedAt && <CardAction onClick={() => void revokeKey(apiKey.id)} label="Revoke" danger />}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
