'use client';

import { useState } from 'react';
import { Hash, Send, Unplug } from 'lucide-react';
import type { Webhook } from './types';
import { isSlackWebhookUrl } from '@/lib/slack-format';
import { DEFAULT_SLACK_EVENTS, SLACK_EVENT_OPTIONS, describeTestResult, getSlackUrlError, maskSlackUrl, toggleEvent } from './slackSettings';

type Props = {
  webhooks: Webhook[];
  onConnect: (url: string, events: string[]) => Promise<boolean>;
  onUpdate: (id: string, patch: { events?: string[]; isActive?: boolean }) => Promise<boolean>;
  onTest: (id: string) => Promise<string>;
  onDisconnect: (id: string) => Promise<void>;
};

export function SlackSettings({ webhooks, onConnect, onUpdate, onTest, onDisconnect }: Props) {
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>(DEFAULT_SLACK_EVENTS);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Record<string, string>>({});
  const slack = webhooks.filter((w) => isSlackWebhookUrl(w.url));

  async function connect() {
    const problem = getSlackUrlError(url) ?? (events.length === 0 ? 'Pick at least one event' : null);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    const ok = await onConnect(url.trim(), events);
    setBusy(false);
    if (ok) setUrl('');
  }

  return (
    <section className="p-5 rounded-2xl border border-slate-800 bg-slate-900 space-y-4" aria-label="Slack notifications">
      <h2 className="font-semibold flex items-center gap-2"><Hash className="w-5 h-5 text-fuchsia-400" /> Slack</h2>
      <div className="space-y-3">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://hooks.slack.com/services/T…/B…/…"
          aria-label="Slack incoming webhook URL"
          className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm"
        />
        <EventPicker selected={events} onChange={setEvents} />
        {error ? <p role="alert" className="text-sm text-red-400">{error}</p> : null}
        <button onClick={() => void connect()} disabled={busy} className="rounded-lg bg-fuchsia-600 px-4 py-2 text-sm font-medium disabled:opacity-50">
          {busy ? 'Connecting…' : 'Connect channel'}
        </button>
      </div>
      {slack.map((w) => (
        <div key={w.id} className="rounded-xl border border-slate-800 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-mono text-slate-300 truncate">{maskSlackUrl(w.url)}</span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={async () => { const m = await onTest(w.id); setResults((r) => ({ ...r, [w.id]: m })); }}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
              ><Send className="w-4 h-4" /> Send test</button>
              <button
                onClick={() => void onUpdate(w.id, { isActive: !w.isActive })}
                className="rounded-lg px-2 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
              >{w.isActive ? 'Pause' : 'Resume'}</button>
              <button
                onClick={() => { if (confirm('Disconnect this Slack channel?')) void onDisconnect(w.id); }}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-red-300 hover:bg-slate-800"
              ><Unplug className="w-4 h-4" /> Disconnect</button>
            </div>
          </div>
          <EventPicker selected={w.events} onChange={(next) => { if (next.length) void onUpdate(w.id, { events: next }); }} />
          {results[w.id] ? <p role="status" className="text-sm text-slate-400">{results[w.id]}</p> : null}
        </div>
      ))}
    </section>
  );
}

function EventPicker({ selected, onChange }: { selected: string[]; onChange: (next: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {SLACK_EVENT_OPTIONS.map((o) => (
        <label key={o.id} className="flex items-center gap-1.5 text-sm text-slate-300">
          <input type="checkbox" checked={selected.includes(o.id)} onChange={() => onChange(toggleEvent(selected, o.id))} />
          {o.label}
        </label>
      ))}
    </div>
  );
}

export { describeTestResult };
