'use client';

import { useState } from 'react';
import { Activity, Check, Copy, Plus } from 'lucide-react';

export function AddWebhookForm({
  adding,
  serverError,
  createdSecret,
  onClearSecret,
  onAdd,
}: {
  adding: boolean;
  serverError: string | null;
  createdSecret: string | null;
  onClearSecret: () => void;
  onAdd: (url: string) => Promise<boolean>;
}) {
  const [newUrl, setNewUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl) return;
    const added = await onAdd(newUrl);
    if (added) setNewUrl('');
  };

  const copySecret = async () => {
    if (!createdSecret) return;
    try {
      await navigator.clipboard.writeText(createdSecret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the secret remains visible for manual copy.
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
      <h2 className="text-lg font-semibold mb-4">Add Endpoint</h2>
      <form onSubmit={handleAdd} className="flex gap-4">
        <input
          type="url"
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          placeholder="https://api.yourdomain.com/webhooks/quicklink"
          className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-slate-100 focus:outline-none focus:border-blue-500"
          required
        />
        <button
          type="submit"
          disabled={adding || !newUrl}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl transition-colors disabled:opacity-50"
        >
          {adding ? <Activity className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Add Endpoint
        </button>
      </form>
      {serverError && <p className="text-red-400 text-sm mt-3">{serverError}</p>}
      {createdSecret && (
        <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <p className="text-sm font-semibold text-emerald-200">
            Endpoint created — copy your signing secret now. It will not be shown again.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg bg-slate-950 px-3 py-2 font-mono text-xs text-slate-200">
              {createdSecret}
            </code>
            <button
              onClick={() => void copySecret()}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-400 transition"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              onClick={onClearSecret}
              className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white hover:border-slate-500 transition"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
