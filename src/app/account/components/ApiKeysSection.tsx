'use client'

import Link from 'next/link'
import { Copy, KeyRound } from 'lucide-react'
import toast from 'react-hot-toast'
import CardAction from '@/app/account/components/CardAction'
import { useApiKeys } from '@/app/account/components/useApiKeys'

const SCOPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'links:read', label: 'Read links' },
  { value: 'links:write', label: 'Write links' },
  { value: 'analytics:read', label: 'Read analytics' },
  { value: 'campaigns:write', label: 'Campaigns' },
  { value: 'webhooks:write', label: 'Webhooks' },
]

export default function ApiKeysSection() {
  const { rotateKey, newKeyScopes, setNewKeyScopes, newKeyExpiryDays, setNewKeyExpiryDays, keys, newKeyName, setNewKeyName, newKeyIps, setNewKeyIps, editAllowlist, createdKey, busy, createKey, revokeKey, dismissCreatedKey } = useApiKeys()

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
        <input
          value={newKeyIps}
          onChange={(e) => setNewKeyIps(e.target.value)}
          placeholder="Allowed IPs/CIDR (optional)"
          aria-label="Allowed IPs or CIDR ranges"
          className="input flex-1"
        />
        <button
          disabled={busy}
          className="rounded-xl bg-violet-500 px-5 py-2.5 text-sm font-semibold hover:bg-violet-400 disabled:opacity-60"
        >
          Create key
        </button>
      </form>
      <fieldset className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-400">
        <legend className="sr-only">Key permissions</legend>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={newKeyScopes.includes('*')}
            onChange={(e) => setNewKeyScopes(e.target.checked ? ['*'] : ['links:read'])}
          />
          Full access
        </label>
        {!newKeyScopes.includes('*') &&
          SCOPE_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={newKeyScopes.includes(option.value)}
                onChange={(e) =>
                  setNewKeyScopes(
                    e.target.checked ? [...newKeyScopes, option.value] : newKeyScopes.filter((v) => v !== option.value).length ? newKeyScopes.filter((v) => v !== option.value) : newKeyScopes,
                  )
                }
              />
              {option.label}
            </label>
          ))}
        <label className="ml-auto flex items-center gap-1.5">
          Expires
          <select value={newKeyExpiryDays} onChange={(e) => setNewKeyExpiryDays(Number(e.target.value))} className="rounded-md bg-slate-800 px-2 py-1">
            <option value={0}>never</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
            <option value={365}>1 year</option>
          </select>
        </label>
      </fieldset>
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
                  {apiKey.health && !apiKey.revokedAt && apiKey.health.status !== 'healthy' && (
                    <span
                      title={apiKey.health.advice}
                      className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-300"
                    >
                      {apiKey.health.status}
                    </span>
                  )}
                  {apiKey.health?.broad && !apiKey.revokedAt && (
                    <span
                      title="Full-access key with no IP allowlist. Prefer scoped keys."
                      className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] text-rose-300"
                    >
                      full access
                    </span>
                  )}
                </div>
                {apiKey.health?.advice && !apiKey.revokedAt && (
                  <p className="mt-0.5 text-xs text-amber-200/80">{apiKey.health.advice}</p>
                )}
                <div className="mt-0.5 font-mono text-xs text-slate-600">
                  {apiKey.prefix}… · {apiKey.scopes && apiKey.scopes !== '*' ? `scopes: ${apiKey.scopes.split(',').join(', ')} · ` : ''}created {new Date(apiKey.createdAt).toLocaleDateString()}
                  {apiKey.lastUsedAt
                    ? ` · last used ${new Date(apiKey.lastUsedAt).toLocaleDateString()}`
                    : ' · never used'}
                  {apiKey.expiresAt ? ` · expires ${new Date(apiKey.expiresAt).toLocaleDateString()}` : ''}
                  {apiKey.allowedIps?.length ? ` · IPs: ${apiKey.allowedIps.join(', ')}` : ''}
                </div>
              </div>
              {!apiKey.revokedAt && <CardAction onClick={() => void editAllowlist(apiKey.id, apiKey.allowedIps ?? [])} label="IPs" />}
              {!apiKey.revokedAt && <CardAction onClick={() => void rotateKey(apiKey.id)} label="Rotate" />}
              {!apiKey.revokedAt && <CardAction onClick={() => void revokeKey(apiKey.id)} label="Revoke" danger />}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
