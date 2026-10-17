'use client';

import { useState } from 'react';
import { KeyRound } from 'lucide-react';

/** Rotates a webhook's signing secret; shows the new secret once, with the grace window for the old one. */
export function RotateSecret({ endpointId }: { endpointId: string }) {
  const [graceHours, setGraceHours] = useState(24);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ secret: string; previousSecretExpiresAt: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function rotate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/webhooks/${endpointId}/rotate-secret`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graceHours }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok || !data || typeof data !== 'object' || !('secret' in data)) {
        setError(data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : 'Rotation failed');
        return;
      }
      setResult(data as { secret: string; previousSecretExpiresAt: string | null });
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 text-sm">
      {!open && !result ? (
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white">
          <KeyRound className="w-4 h-4" /> Rotate secret
        </button>
      ) : null}
      {open ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-800 p-3">
          <label className="text-slate-300" htmlFor={`grace-${endpointId}`}>Keep old secret valid for</label>
          <select
            id={`grace-${endpointId}`}
            value={graceHours}
            onChange={(e) => setGraceHours(Number(e.target.value))}
            className="rounded-md bg-slate-800 px-2 py-1"
          >
            <option value={0}>0 hours (revoke now)</option>
            <option value={1}>1 hour</option>
            <option value={24}>24 hours</option>
            <option value={72}>3 days</option>
            <option value={168}>7 days</option>
          </select>
          <button disabled={busy} onClick={() => void rotate()} className="rounded-md bg-indigo-600 px-3 py-1 text-white disabled:opacity-50">
            {busy ? 'Rotating…' : 'Rotate'}
          </button>
          <button onClick={() => setOpen(false)} className="text-slate-400">Cancel</button>
        </div>
      ) : null}
      {result ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-200">
          <p>New secret (shown once):</p>
          <code className="block break-all font-mono">{result.secret}</code>
          <p className="mt-1 text-xs">
            {result.previousSecretExpiresAt
              ? `Old secret also signs deliveries until ${new Date(result.previousSecretExpiresAt).toLocaleString()}.`
              : 'Old secret revoked immediately.'}
          </p>
          <button onClick={() => setResult(null)} className="mt-2 text-xs underline">Done</button>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-red-400">{error}</p> : null}
    </div>
  );
}
