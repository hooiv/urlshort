'use client'

import { useCallback, useEffect, useState } from 'react'
import { Coins, Download, Plus, Trash2 } from 'lucide-react'

type Rule = { id: string; key: string; equals: string[]; type: 'percent' | 'flat'; amount: number; priority?: number; capCents?: number }
type Fallback = { type: 'percent' | 'flat'; amount: number; capCents?: number } | null
type Config = { scope: 'account' | 'link'; urlId: string | null; shortCode: string | null; rules: Rule[]; fallback: Fallback }
type Commission = { id: string; shortCode: string; saleValueCents: number; amountCents: number; clawbackCents: number; currency: string | null; status: string; ruleId: string | null; createdAt: string; payoutRef: string | null }
type Totals = Record<string, { count: number; amountCents: number; clawbackCents: number }>
type Risk = { commissionId: string; score: number; level: 'low' | 'medium' | 'high'; signals: string[] }
type Preview = { cents: number; ruleId: string | null; scopeIndex: number | null }

const SIGNAL_LABELS: Record<string, string> = { instant_conversion: 'Converted <3s after click', no_click: 'No matching click', repeat_visitor: 'Same visitor repeatedly', burst: 'Burst of conversions', single_ip_cluster: 'Many from one IP' }
const RISK_STYLE = { low: 'text-slate-400', medium: 'text-amber-300', high: 'text-red-400' } as const
const STATUSES = ['pending', 'approved', 'paid', 'reversed'] as const
const money = (cents: number, currency?: string | null) => `${currency && currency !== 'USD' ? `${currency} ` : '$'}${(cents / 100).toFixed(2)}`
const uid = () => `r${Math.random().toString(36).slice(2, 8)}`

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || 'Request failed')
  return data as T
}

export default function RewardsPage() {
  const [configs, setConfigs] = useState<Config[]>([])
  const [shortCode, setShortCode] = useState('')
  const [rules, setRules] = useState<Rule[]>([])
  const [fallbackType, setFallbackType] = useState<'percent' | 'flat' | ''>('percent')
  const [fallbackAmount, setFallbackAmount] = useState('10')
  const [sampleValue, setSampleValue] = useState('49.00')
  const [sampleMeta, setSampleMeta] = useState('plan=pro')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [risks, setRisks] = useState<Record<string, Risk>>({})
  const [totals, setTotals] = useState<Totals>({})
  const [status, setStatus] = useState<string>('pending')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    let live = true
    api<{ configs: Config[] }>('/api/rewards/config')
      .then((d) => { if (live) setConfigs(d.configs) })
      .catch((e) => live && setError(e.message))
    return () => { live = false }
  }, [reloadKey])
  useEffect(() => {
    let live = true
    api<{ commissions: Commission[]; totals: Totals }>(`/api/commissions?status=${status}`)
      .then((d) => { if (live) { setCommissions(d.commissions); setTotals(d.totals); setSelected(new Set()) } })
      .catch((e) => live && setError(e.message))
    return () => { live = false }
  }, [status, reloadKey])

  useEffect(() => {
    let live = true
    api<{ risks: Risk[] }>('/api/commissions/risk?minLevel=low')
      .then((d) => { if (live) setRisks(Object.fromEntries(d.risks.map((r) => [r.commissionId, r]))) })
      .catch(() => live && setRisks({}))
    return () => { live = false }
  }, [reloadKey])

  /** Load a scope into the editor. */
  function edit(config: Config | null) {
    setShortCode(config?.shortCode ?? '')
    setRules(config?.rules ?? [])
    setFallbackType(config?.fallback?.type ?? '')
    setFallbackAmount(config?.fallback ? String(config.fallback.amount / 100) : '')
    setPreview(null)
  }

  const toFallback = (): Fallback => {
    if (!fallbackType || fallbackAmount === '') return null
    const n = Number(fallbackAmount)
    return { type: fallbackType, amount: Math.round(n * 100) }
  }
  const scopeBody = () => ({ rules, fallback: toFallback() })

  async function save() {
    setBusy(true); setError(null); setNotice(null)
    try {
      await api('/api/rewards/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...scopeBody(), ...(shortCode.trim() ? { shortCode: shortCode.trim() } : {}) }) })
      reload()
      setNotice(shortCode.trim() ? `Saved rewards for /${shortCode.trim()}` : 'Saved the account default')
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  async function removeConfig(c: Config) {
    setError(null)
    try {
      await api(`/api/rewards/config${c.urlId ? `?urlId=${encodeURIComponent(c.urlId)}` : ''}`, { method: 'DELETE' })
      reload()
    } catch (e) { setError((e as Error).message) }
  }

  async function runPreview() {
    setError(null)
    const metadata: Record<string, string> = {}
    for (const part of sampleMeta.split(',')) {
      const [k, ...v] = part.split('=')
      if (k.trim()) metadata[k.trim()] = v.join('=').trim()
    }
    try {
      const data = await api<{ results: Preview[] }>('/api/rewards/preview', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scopes: [scopeBody()], samples: [{ saleValueCents: Math.round(Number(sampleValue) * 100), metadata }] }),
      })
      setPreview(data.results[0])
    } catch (e) { setError((e as Error).message); setPreview(null) }
  }

  async function act(action: 'approve' | 'pay' | 'reverse', body: Record<string, unknown>) {
    setBusy(true); setError(null); setNotice(null)
    try {
      const { changed } = await api<{ changed: number }>('/api/commissions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...body }) })
      setNotice(`${changed} commission${changed === 1 ? '' : 's'} updated`)
      reload()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  const payRef = () => (typeof window === 'undefined' ? undefined : window.prompt('Payout reference (optional, e.g. wire id)') ?? undefined)
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const ids = [...selected]

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2"><Coins className="w-8 h-8 text-amber-500" />Rewards</h1>
        <p className="text-slate-400 mt-1">Pay a commission on every Stripe sale a link drives. A link&apos;s own rules win over your account default; refunds shrink commissions automatically.</p>
      </div>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      {notice && <p aria-live="polite" className="text-sm text-emerald-400">{notice}</p>}

      <section className="space-y-4 bg-slate-900/60 border border-slate-800 rounded-xl p-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-slate-300">Applies to
            <input value={shortCode} onChange={(e) => setShortCode(e.target.value)} placeholder="Account default (or a short code)" className="mt-1 block w-64 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2" />
          </label>
          <label className="text-sm text-slate-300">Default reward
            <span className="mt-1 flex gap-2">
              <select aria-label="Default reward type" value={fallbackType} onChange={(e) => setFallbackType(e.target.value as 'percent' | 'flat' | '')} className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-2">
                <option value="">None</option><option value="percent">% of sale</option><option value="flat">Flat $</option>
              </select>
              <input aria-label="Default reward amount" type="number" min="0" step="0.01" value={fallbackAmount} onChange={(e) => setFallbackAmount(e.target.value)} className="w-24 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2" />
            </span>
          </label>
        </div>

        <div className="space-y-2">
          <p className="text-sm text-slate-300">Rules <span className="text-slate-500">— first match by priority wins; matched on Stripe checkout metadata</span></p>
          {rules.map((r, i) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-slate-500">when</span>
              <input aria-label="Metadata key" value={r.key} placeholder="plan" onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} className="w-28 bg-slate-950 border border-slate-700 rounded px-2 py-1" />
              <span className="text-slate-500">is</span>
              <input aria-label="Values (comma separated)" value={r.equals.join(',')} placeholder="pro,team" onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, equals: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) } : x)))} className="w-36 bg-slate-950 border border-slate-700 rounded px-2 py-1" />
              <span className="text-slate-500">pay</span>
              <select aria-label="Rule type" value={r.type} onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, type: e.target.value as 'percent' | 'flat' } : x)))} className="bg-slate-950 border border-slate-700 rounded px-1 py-1">
                <option value="percent">%</option><option value="flat">$</option>
              </select>
              <input aria-label="Rule amount" type="number" min="0" step="0.01" value={r.amount / 100} onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, amount: Math.round(Number(e.target.value) * 100) } : x)))} className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1" />
              <button aria-label="Remove rule" onClick={() => setRules(rules.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
          <button onClick={() => setRules([...rules, { id: uid(), key: '', equals: [], type: 'percent', amount: 1000, priority: rules.length }])} disabled={rules.length >= 25} className="inline-flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"><Plus className="w-4 h-4" />Add rule</button>
        </div>

        <div className="flex flex-wrap items-end gap-3 border-t border-slate-800 pt-4">
          <label className="text-sm text-slate-300">Sample sale ($)
            <input type="number" min="0" step="0.01" value={sampleValue} onChange={(e) => setSampleValue(e.target.value)} className="mt-1 block w-28 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2" />
          </label>
          <label className="text-sm text-slate-300">Metadata
            <input value={sampleMeta} onChange={(e) => setSampleMeta(e.target.value)} className="mt-1 block w-52 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2" />
          </label>
          <button onClick={runPreview} className="rounded-lg border border-slate-700 px-4 py-2 text-sm hover:border-slate-500">Preview</button>
          {preview && <p className="text-sm" aria-live="polite">{preview.scopeIndex === null ? 'No reward would be paid.' : <>Pays <strong>{money(preview.cents)}</strong>{preview.ruleId ? <> via rule <code>{preview.ruleId}</code></> : ' via the default'}</>}</p>}
          <button onClick={save} disabled={busy} className="ml-auto bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg px-4 py-2 text-sm font-medium">Save rewards</button>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Configured scopes</h2>
        {configs.length === 0 && <p className="text-sm text-slate-500">Nothing configured, so no commissions are created yet.</p>}
        {configs.map((c) => (
          <div key={c.urlId ?? 'account'} className="flex items-center justify-between bg-slate-900/60 border border-slate-800 rounded-lg px-4 py-3 text-sm">
            <button onClick={() => edit(c)} className="text-left hover:text-blue-400">
              <span className="font-medium">{c.shortCode ? `/${c.shortCode}` : 'Account default'}</span>
              <span className="text-slate-400"> · {c.rules.length} rule{c.rules.length === 1 ? '' : 's'}{c.fallback ? ` · default ${c.fallback.type === 'percent' ? `${c.fallback.amount / 100}%` : money(c.fallback.amount)}` : ''}</span>
            </button>
            <button aria-label="Delete scope" onClick={() => removeConfig(c)} className="text-slate-400 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold mr-2">Commissions</h2>
          {STATUSES.map((s) => (
            <button key={s} onClick={() => setStatus(s)} aria-pressed={status === s} className={`rounded-full px-3 py-1 text-xs border ${status === s ? 'border-blue-500 text-blue-300' : 'border-slate-700 text-slate-400'}`}>
              {s} · {money(totals[s]?.amountCents ?? 0)} ({totals[s]?.count ?? 0})
            </button>
          ))}
          <a href="/api/commissions/export?status=approved" download className="ml-auto inline-flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"><Download className="w-4 h-4" />Payout CSV (approved)</a>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <button disabled={busy} onClick={() => act('approve', { allDue: true })} className="rounded-lg border border-slate-700 px-3 py-1.5 hover:border-slate-500">Approve all past refund window</button>
          {status === 'pending' && <button disabled={busy || !ids.length} onClick={() => act('approve', { ids })} className="rounded-lg border border-slate-700 px-3 py-1.5 disabled:opacity-40">Approve selected</button>}
          {status === 'approved' && <button disabled={busy || !ids.length} onClick={() => { const ref = payRef(); void act('pay', { ids, ...(ref ? { payoutRef: ref } : {}) }) }} className="rounded-lg border border-slate-700 px-3 py-1.5 disabled:opacity-40">Mark selected paid</button>}
          {(status === 'pending' || status === 'approved') && <button disabled={busy || !ids.length} onClick={() => act('reverse', { ids })} className="rounded-lg border border-slate-700 px-3 py-1.5 text-red-300 disabled:opacity-40">Reverse selected</button>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-400"><tr><th className="py-2 w-8" /><th>Link</th><th>Sale</th><th>Commission</th><th>Rule</th><th>Risk</th><th>Date</th></tr></thead>
            <tbody>
              {commissions.length === 0 && <tr><td colSpan={7} className="py-4 text-slate-500">No {status} commissions.</td></tr>}
              {commissions.map((c) => (
                <tr key={c.id} className="border-t border-slate-800">
                  <td className="py-2"><input type="checkbox" aria-label={`Select ${c.shortCode}`} checked={selected.has(c.id)} onChange={() => toggle(c.id)} /></td>
                  <td>/{c.shortCode}</td>
                  <td>{money(c.saleValueCents, c.currency)}</td>
                  <td>{money(c.amountCents, c.currency)}{c.clawbackCents > 0 && <span className="text-red-400"> (−{money(c.clawbackCents, c.currency)} clawback)</span>}</td>
                  <td className="text-slate-400">{c.ruleId ?? 'default'}</td>
                  <td>{(status === 'pending' || status === 'approved') && risks[c.id] && risks[c.id].signals.length > 0 ? (
                    <span className={RISK_STYLE[risks[c.id].level]} title={risks[c.id].signals.map((k) => SIGNAL_LABELS[k] ?? k).join(', ')}>{risks[c.id].level} ({risks[c.id].score})</span>
                  ) : <span className="text-slate-600">—</span>}</td>
                  <td className="text-slate-400">{new Date(c.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
