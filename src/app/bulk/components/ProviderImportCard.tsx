'use client';

import { useState } from 'react';
import { CloudDownload, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatNumber } from '@/lib/format';

type Provider = 'bitly' | 'shortio' | 'rebrandly';

const PROVIDERS: Record<Provider, { label: string; tokenHint: string; scopeLabel: string; scopePlaceholder: string }> = {
  bitly: { label: 'Bitly', tokenHint: 'Settings → Developer settings → API → Generate token', scopeLabel: 'Group GUID (optional)', scopePlaceholder: 'Default group' },
  shortio: { label: 'Short.io', tokenHint: 'Integrations & API → API → Create secret key', scopeLabel: 'Domain (optional)', scopePlaceholder: 'First domain, e.g. go.brand.com' },
  rebrandly: { label: 'Rebrandly', tokenHint: 'Account → API keys → New API key', scopeLabel: 'Domain (optional)', scopePlaceholder: 'All domains' },
};

/**
 * Import directly from a competitor's API. The token goes to our server for
 * this one request and is never stored; the destination workspace, folder and
 * alias-conflict policy are the ones chosen in the CSV form.
 */
export function ProviderImportCard({
  busy,
  onImport,
}: {
  busy: boolean;
  onImport: (name: Provider, token: string, scope: string) => Promise<{ created: number; skipped: number; truncated: boolean }>;
}) {
  const [provider, setProvider] = useState<Provider>('bitly');
  const [token, setToken] = useState('');
  const [scope, setScope] = useState('');
  const meta = PROVIDERS[provider];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await onImport(provider, token, scope);
      setToken('');
      const base = `Imported ${formatNumber(result.created)} links from ${meta.label}`;
      if (result.truncated) toast.success(`${base}. Stopped at the per-import limit; filter by group or domain to import the rest.`, { duration: 8000 });
      else toast.success(result.skipped ? `${base}, ${formatNumber(result.skipped)} skipped (see the report)` : base);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
    }
  };

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <CloudDownload className="h-5 w-5 text-blue-400" /> Import from another platform
      </h2>
      <p className="mt-1 text-sm text-slate-400">
        Pulls links, titles, tags and back-halves straight from the API, no export needed. Your token is used once and never stored.
      </p>
      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-[10rem_1fr_1fr_auto] sm:items-end">
        <label className="text-xs text-slate-400">
          Platform
          <select
            value={provider}
            onChange={(e) => { setProvider(e.target.value as Provider); setScope(''); }}
            className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          >
            {(Object.keys(PROVIDERS) as Provider[]).map((p) => <option key={p} value={p}>{PROVIDERS[p].label}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-400">
          API token
          <input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={meta.tokenHint}
            className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            required
            minLength={8}
          />
        </label>
        <label className="text-xs text-slate-400">
          {meta.scopeLabel}
          <input
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            placeholder={meta.scopePlaceholder}
            className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          />
        </label>
        <button
          type="submit"
          disabled={busy || token.trim().length < 8}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Import
        </button>
      </form>
    </section>
  );
}
