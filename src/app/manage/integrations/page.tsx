'use client';

import { useEffect, useState } from 'react';
import { Activity, Check, Copy, CreditCard, Pause, Play, Plus, Trash2 } from 'lucide-react';

type StripeIntegration = {
  id: string;
  name: string;
  goalEventKey: string;
  trackRecurring: boolean;
  livemode: boolean | null;
  isActive: boolean;
  hasSigningSecret: boolean;
  lastEventAt: string | null;
  createdAt: string;
  webhookUrl: string;
  events: string[];
};

const CHECKOUT_SNIPPET = `// On your site, read the token QuickLink appended to the URL fragment
const token = new URLSearchParams(location.hash.slice(1)).get('ql_attribution');

// On your server, pass it to Stripe Checkout
await stripe.checkout.sessions.create({
  // ...line_items, mode, success_url
  metadata: { ql_attribution: token },
  // For subscriptions, renewals are credited automatically via the customer.
});`;

function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard unavailable: the value stays visible for manual copy.
        }
      }}
      className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white hover:border-slate-500 transition"
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copied' : label}
    </button>
  );
}

function SecretInput({ hasSecret, onSave }: { hasSecret: boolean; onSave: (value: string) => Promise<boolean> }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        if (await onSave(value.trim())) setValue('');
        setBusy(false);
      }}
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        type="password"
        autoComplete="off"
        placeholder={hasSecret ? 'Roll signing secret: whsec_…' : 'Paste signing secret: whsec_…'}
        aria-label="Stripe webhook signing secret"
        className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 font-mono text-xs text-slate-100 focus:outline-none focus:border-violet-500"
      />
      <button type="submit" disabled={busy || !value.trim().startsWith('whsec_')} className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
        {hasSecret ? 'Update' : 'Save & activate'}
      </button>
    </form>
  );
}

export default function IntegrationsPage() {
  const [items, setItems] = useState<StripeIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [secret, setSecret] = useState('');
  const [trackRecurring, setTrackRecurring] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/integrations/stripe', { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 401 ? 'Sign in to manage integrations.' : 'Could not load integrations.');
        setItems(await res.json());
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Could not load integrations.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/integrations/stripe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || undefined, signingSecret: secret.trim() || undefined, trackRecurring }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not connect Stripe.');
      setItems((current) => [body as StripeIntegration, ...current]);
      setName('');
      setSecret('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect Stripe.');
    } finally {
      setSaving(false);
    }
  };

  const patch = async (id: string, data: Partial<Pick<StripeIntegration, 'isActive' | 'trackRecurring'>> & { signingSecret?: string }) => {
    const res = await fetch(`/api/integrations/stripe/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (res.ok) {
      const updated = (await res.json()) as StripeIntegration;
      setItems((current) => current.map((item) => (item.id === id ? updated : item)));
      return true;
    }
    const body = await res.json().catch(() => ({}));
    setError(body.error || 'Update failed.');
    return false;
  };

  const remove = async (id: string) => {
    if (!confirm('Disconnect this Stripe account? Recorded sales are kept.')) return;
    const res = await fetch(`/api/integrations/stripe/${id}`, { method: 'DELETE' });
    if (res.ok) setItems((current) => current.filter((item) => item.id !== id));
    else setError('Delete failed.');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <CreditCard className="w-8 h-8 text-violet-400" />
          Revenue attribution
        </h1>
        <p className="text-slate-400 mt-1">
          Connect Stripe and every paid checkout is credited to the short link that drove it, renewals included.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 space-y-4">
        <h2 className="text-lg font-semibold">Connect a Stripe account</h2>
        <ol className="list-decimal list-inside text-sm text-slate-400 space-y-1">
          <li>Create the integration to get its endpoint URL.</li>
          <li>In Stripe → Developers → Webhooks, add that URL and select the events shown on the integration.</li>
          <li>Paste the endpoint&apos;s signing secret (whsec_…) on the integration. It activates right away.</li>
        </ol>
        <form onSubmit={create} className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name (e.g. Main store)"
              maxLength={80}
              className="sm:w-56 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-slate-100 focus:outline-none focus:border-violet-500"
            />
            <input
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="whsec_… (optional, add later)"
              type="password"
              autoComplete="off"
              aria-label="Stripe webhook signing secret"
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 font-mono text-sm text-slate-100 focus:outline-none focus:border-violet-500"
            />
            <button
              type="submit"
              disabled={saving || (secret.length > 0 && !secret.startsWith('whsec_'))}
              className="flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-6 py-2 rounded-xl transition-colors disabled:opacity-50"
            >
              {saving ? <Activity className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-400">
            <input type="checkbox" checked={trackRecurring} onChange={(e) => setTrackRecurring(e.target.checked)} />
            Credit subscription renewals to the link that acquired the customer
          </label>
        </form>
        {error && <p className="text-red-400 text-sm">{error}</p>}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Pass the token to Checkout</h2>
          <CopyButton value={CHECKOUT_SNIPPET} label="Copy snippet" />
        </div>
        <pre className="overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-300"><code>{CHECKOUT_SNIPPET}</code></pre>
      </div>

      <div className="space-y-4">
        {loading && <p className="text-slate-500 text-sm">Loading…</p>}
        {!loading && items.length === 0 && <p className="text-slate-500 text-sm">No Stripe accounts connected yet.</p>}
        {items.map((item) => (
          <div key={item.id} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{item.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${item.isActive ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-700 text-slate-300'}`}>
                  {item.isActive ? 'Active' : item.hasSigningSecret ? 'Paused' : 'Needs signing secret'}
                </span>
                {item.livemode !== null && (
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">{item.livemode ? 'Live' : 'Test mode'}</span>
                )}
              </div>
              <div className="flex gap-2">
                <button disabled={!item.hasSigningSecret} onClick={() => void patch(item.id, { isActive: !item.isActive })} className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:text-white">
                  {item.isActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  {item.isActive ? 'Pause' : 'Resume'}
                </button>
                <button onClick={() => void remove(item.id)} className="flex items-center gap-1.5 rounded-lg border border-red-900 px-3 py-1.5 text-xs text-red-300 hover:text-red-200">
                  <Trash2 className="w-3.5 h-3.5" /> Disconnect
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg bg-slate-950 px-3 py-2 font-mono text-xs text-slate-200">{item.webhookUrl}</code>
              <CopyButton value={item.webhookUrl} />
            </div>
            <SecretInput hasSecret={item.hasSigningSecret} onSave={(value) => patch(item.id, { signingSecret: value })} />
            <p className="text-xs text-slate-500">
              Events: {item.events.join(', ')} · Goal key: <code>{item.goalEventKey}</code> · Last event:{' '}
              {item.lastEventAt ? new Date(item.lastEventAt).toLocaleString() : 'none yet'}
            </p>
            <label className="flex items-center gap-2 text-xs text-slate-400">
              <input type="checkbox" checked={item.trackRecurring} onChange={(e) => void patch(item.id, { trackRecurring: e.target.checked })} />
              Credit renewals
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
