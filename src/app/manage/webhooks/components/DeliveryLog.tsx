'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';

type Status = 'pending' | 'success' | 'failed';
type Delivery = {
  id: string; event: string; status: Status; responseCode: number | null; attempts: number; latencyMs: number | null;
  createdAt: string; lastAttemptAt: string | null; nextAttemptAt: string | null; replayOfId: string | null;
};
type Stats = { total: number; success: number; failed: number; pending: number; successRate: number | null; p50LatencyMs: number | null; p95LatencyMs: number | null };
type Detail = Delivery & { payload: string; responseBody: string | null };

const STATUS_STYLE: Record<Status, string> = {
  success: 'bg-emerald-500/15 text-emerald-300',
  failed: 'bg-red-500/15 text-red-300',
  pending: 'bg-amber-500/15 text-amber-300',
};

const prettyJson = (raw: string) => { try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; } };
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const errorOf = async (res: Response, fallback: string) => ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? fallback;

/** Delivery history for one endpoint: 24h health, filterable log, payload inspector, redelivery. */
export function DeliveryLog({ endpointId, isActive }: { endpointId: string; isActive: boolean }) {
  const [status, setStatus] = useState<Status | ''>('');
  const [rows, setRows] = useState<Delivery[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Detail | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (after: string | null) => {
    setLoading(true);
    setError(null);
    const q = new URLSearchParams({ limit: '25' });
    if (status) q.set('status', status);
    if (after) q.set('cursor', after);
    try {
      const res = await fetch(`/api/webhooks/${endpointId}/deliveries?${q}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(await errorOf(res, 'Could not load deliveries'));
      const data = (await res.json()) as { deliveries: Delivery[]; nextCursor: string | null; stats?: Stats };
      setRows((prev) => (after ? [...prev, ...data.deliveries] : data.deliveries));
      setCursor(data.nextCursor);
      if (data.stats) setStats(data.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load deliveries');
    } finally {
      setLoading(false);
    }
  }, [endpointId, status]);

  useEffect(() => { void load(null); }, [load]);

  const inspect = async (id: string) => {
    if (open?.id === id) { setOpen(null); return; }
    const res = await fetch(`/api/webhooks/${endpointId}/deliveries/${id}`, { cache: 'no-store' });
    if (!res.ok) { toast.error(await errorOf(res, 'Could not load delivery')); return; }
    setOpen((await res.json()) as Detail);
  };

  const replay = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/webhooks/${endpointId}/deliveries/${id}/replay`, { method: 'POST' });
      if (!res.ok) throw new Error(await errorOf(res, 'Redelivery failed'));
      const data = (await res.json()) as { status: Status; statusCode: number | null };
      if (data.status === 'success') toast.success(`Redelivered (${data.statusCode})`);
      else toast.error(`Receiver answered ${data.statusCode ?? 'no response'}; will retry automatically`);
      await load(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Redelivery failed');
    } finally {
      setBusyId(null);
    }
  };

  const replayFailed = async () => {
    setBusyId('all');
    try {
      const res = await fetch(`/api/webhooks/${endpointId}/deliveries/replay-failed`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hours: 24 }) });
      if (!res.ok) throw new Error(await errorOf(res, 'Could not queue redeliveries'));
      const { queued } = (await res.json()) as { queued: number };
      toast.success(queued ? `Queued ${queued} failed deliveries for resend` : 'No failed deliveries to resend');
      await load(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not queue redeliveries');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mt-4 border-t border-slate-800 pt-4 text-sm">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-slate-400">
        <span>Last 24h: <b className="text-slate-100">{stats?.total ?? '–'}</b> sent</span>
        <span>Success <b className="text-slate-100">{stats?.successRate == null ? '–' : `${stats.successRate}%`}</b></span>
        <span>p50 <b className="text-slate-100">{stats?.p50LatencyMs == null ? '–' : `${stats.p50LatencyMs} ms`}</b></span>
        <span>p95 <b className="text-slate-100">{stats?.p95LatencyMs == null ? '–' : `${stats.p95LatencyMs} ms`}</b></span>
        <div className="ml-auto flex items-center gap-2">
          <select value={status} onChange={(e) => setStatus(e.target.value as Status | '')} className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-slate-200" aria-label="Filter by status">
            <option value="">All</option><option value="failed">Failed</option><option value="pending">Retrying</option><option value="success">Succeeded</option>
          </select>
          <button onClick={() => void replayFailed()} disabled={!isActive || busyId !== null || !stats?.failed} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:border-slate-500 disabled:opacity-40" title={isActive ? 'Resend failed deliveries from the last 24h' : 'Enable the endpoint first'}>
            {busyId === 'all' ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />} Resend failed
          </button>
        </div>
      </div>

      {error ? <p className="mt-3 text-red-300">{error}</p> : null}
      {!loading && !error && rows.length === 0 ? <p className="mt-3 text-slate-500">No deliveries yet.</p> : null}

      <ul className="mt-3 divide-y divide-slate-800/70">
        {rows.map((d) => (
          <li key={d.id} className="py-2">
            <div className="flex items-center gap-3">
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_STYLE[d.status]}`}>{d.status === 'pending' ? 'retrying' : d.status}</span>
              <button onClick={() => void inspect(d.id)} className="font-mono text-xs text-slate-200 hover:underline">{d.event}</button>
              <span className="text-xs text-slate-500">{when(d.createdAt)}</span>
              <span className="text-xs text-slate-500">{d.responseCode ?? '—'} · {d.latencyMs == null ? '—' : `${d.latencyMs} ms`} · {d.attempts} {d.attempts === 1 ? 'attempt' : 'attempts'}</span>
              {d.replayOfId ? <span className="text-[11px] text-slate-500">redelivery</span> : null}
              {d.status === 'pending' && d.nextAttemptAt ? <span className="text-[11px] text-amber-300/80">next {when(d.nextAttemptAt)}</span> : null}
              <button onClick={() => void replay(d.id)} disabled={!isActive || busyId !== null} className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-40" title="Resend now" aria-label="Resend now">
                {busyId === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              </button>
            </div>
            {open?.id === d.id ? (
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <div><p className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">Payload</p><pre className="max-h-64 overflow-auto rounded-lg bg-slate-950 p-2 text-xs text-slate-300">{prettyJson(open.payload)}</pre></div>
                <div><p className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">Response</p><pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-2 text-xs text-slate-300">{open.responseBody || '(empty)'}</pre></div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {cursor ? <button onClick={() => void load(cursor)} disabled={loading} className="mt-2 text-xs text-blue-300 hover:underline disabled:opacity-50">{loading ? 'Loading…' : 'Load older'}</button> : null}
      {loading && rows.length === 0 ? <div className="mt-3 h-10 animate-pulse rounded-lg bg-slate-800/40" /> : null}
    </div>
  );
}
