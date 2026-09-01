/* eslint-disable react-hooks/set-state-in-effect -- campaign data is remote state synchronized after mount. */
'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Activity, ArrowUpRight, CheckCircle2, ChevronDown, ChevronUp, CircleDot, Pause, Play, Plus, RefreshCw, ShieldCheck, Target, TriangleAlert } from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'

type LinkOption = {
  id: string
  shortCode: string
  title: string | null
  originalUrl: string
  clicks: number
  healthStatus: string
}

type Variant = {
  id: string
  name: string
  destinationUrl: string
  weight: number
  clicks: number
  conversions: number
  valueCents: string
  isControl: boolean
}

type Decision = {
  id: string
  action: string
  reason: string
  confidenceBps: number | null
  oldWeightsJson: string | null
  newWeightsJson: string | null
  actorType: string
  createdAt: string
}

type Anomaly = {
  id: string
  type: string
  severity: string
  metric: string
  baseline: number
  observed: number
  deviation: number
  startedAt: string
  resolvedAt: string | null
}

type Campaign = {
  id: string
  name: string
  slug: string
  status: string
  objective: string
  currency: string
  autoOptimize: boolean
  confidenceThreshold: number
  minSampleSize: number
  minConversions: number
  maxTrafficShiftPercent: number
  version: number
  createdAt: string
  updatedAt: string
  variants: Variant[]
  decisions: Decision[]
  anomalies: Anomaly[]
  links: Array<{ url: LinkOption }>
}

const objectiveLabels: Record<string, string> = {
  conversion_rate: 'Conversion rate',
  revenue_per_click: 'Revenue / click',
  revenue: 'Total revenue',
  conversion_value: 'Value / conversion',
}

const emptyVariant = (name: string, destinationUrl: string, isControl = false) => ({ name, destinationUrl, isControl, weight: 50 })

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [links, setLinks] = useState<LinkOption[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [primaryUrlId, setPrimaryUrlId] = useState('')
  const [objective, setObjective] = useState('conversion_rate')
  const [autoOptimize, setAutoOptimize] = useState(true)
  const [controlName, setControlName] = useState('Control')
  const [variantName, setVariantName] = useState('Variant B')
  const [controlUrl, setControlUrl] = useState('')
  const [variantUrl, setVariantUrl] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const [campaignResponse, linkResponse] = await Promise.all([
        fetch('/api/campaigns', { cache: 'no-store' }),
        fetch('/api/shorten?take=100', { cache: 'no-store' }),
      ])
      const [campaignPayload, linkPayload] = await Promise.all([campaignResponse.json(), linkResponse.json()])
      if (!campaignResponse.ok) throw new Error(campaignPayload.error || 'Unable to load campaigns')
      if (!linkResponse.ok) throw new Error(linkPayload.error || 'Unable to load links')
      setCampaigns(campaignPayload)
      setLinks(linkPayload.links || [])
      setPrimaryUrlId((current) => current || linkPayload.links?.[0]?.id || '')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load campaign control plane')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const selectedLink = useMemo(() => links.find((link) => link.id === primaryUrlId) || null, [links, primaryUrlId])

  async function createCampaign(event: React.FormEvent) {
    event.preventDefault()
    if (!primaryUrlId) return toast.error('Select the permanent short link that will receive traffic')
    setCreating(true)
    try {
      const response = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          name,
          slug,
          primaryUrlId,
          objective,
          autoOptimize,
          variants: [emptyVariant(controlName, controlUrl, true), emptyVariant(variantName, variantUrl, false)],
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Campaign creation failed')
      toast.success('Campaign created and attached to the entry link')
      setName(''); setSlug(''); setControlName('Control'); setVariantName('Variant B'); setControlUrl(selectedLink?.originalUrl || ''); setVariantUrl('')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Campaign creation failed')
    } finally {
      setCreating(false)
    }
  }

  async function campaignAction(id: string, action: 'start' | 'autopilot' | 'pause') {
    setBusyId(id)
    try {
      const response = await fetch(`/api/campaigns/${id}${action === 'start' ? '?action=start' : action === 'autopilot' ? '?action=autopilot' : ''}`, {
        method: action === 'pause' ? 'PATCH' : 'POST',
        headers: action === 'pause' ? { 'content-type': 'application/json' } : undefined,
        body: action === 'pause' ? JSON.stringify({ status: 'paused' }) : undefined,
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Campaign action failed')
      toast.success(action === 'autopilot' ? (payload.reason || 'Autopilot evaluated the campaign') : action === 'start' ? 'Campaign is now live' : 'Campaign paused')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Campaign action failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <Toaster position="top-right" />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-12">
        <header className="flex flex-col gap-6 border-b border-slate-800 pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-blue-300">
              <Target className="h-5 w-5" />
              <span className="text-xs font-semibold uppercase tracking-[0.18em]">Campaign Control Plane</span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">Autopilot for every campaign link.</h1>
            <p className="mt-3 text-sm leading-6 text-slate-400 sm:text-base">Attach an experiment to a permanent short link, let evidence move allocation safely, and keep every decision, anomaly, and release traceable.</p>
          </div>
          <button onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-200 hover:border-slate-500 disabled:opacity-50 lg:self-auto">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </header>

        <BulkCampaignActions campaigns={campaigns} onDone={() => void load()} />`r`n`r`n<section className="mt-8 grid gap-8 xl:grid-cols-[380px_1fr]">
          <form onSubmit={createCampaign} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-xl shadow-black/20 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-white">Launch an adaptive campaign</h2>
                <p className="mt-1 text-xs text-slate-500">The entry link is the permanent asset. Destinations can change without changing what you print or publish.</p>
              </div>
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
            </div>

            <div className="mt-6 space-y-4">
              <label className="block"><span className="field-label">Entry short link</span>
                <select value={primaryUrlId} onChange={(event) => { setPrimaryUrlId(event.target.value); const option = links.find((link) => link.id === event.target.value); if (option) setControlUrl(option.originalUrl) }} required className="input mt-2 w-full">
                  <option value="">Choose a permanent link…</option>
                  {links.map((link) => <option key={link.id} value={link.id}>/{link.shortCode} {link.title ? `— ${link.title}` : ''}</option>)}
                </select>
              </label>
              {selectedLink && <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs"><div className="flex items-center justify-between gap-3"><span className="font-mono text-blue-300">/{selectedLink.shortCode}</span><span className="text-slate-500">{selectedLink.clicks.toLocaleString()} clicks</span></div><p className="mt-1 truncate text-slate-500">{selectedLink.originalUrl}</p></div>}

              <div className="grid gap-3 sm:grid-cols-2">
                <label><span className="field-label">Campaign name</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Spring launch" required className="input mt-2 w-full" /></label>
                <label><span className="field-label">Slug</span><input value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="spring-launch" required pattern="[a-z0-9][a-z0-9-]{1,62}" className="input mt-2 w-full font-mono" /></label>
              </div>

              <label><span className="field-label">Optimization objective</span><select value={objective} onChange={(event) => setObjective(event.target.value)} className="input mt-2 w-full">{Object.entries(objectiveLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>

              <VariantEditor label="CONTROL" name={controlName} setName={setControlName} url={controlUrl} setUrl={setControlUrl} />
              <VariantEditor label="VARIANT B" name={variantName} setName={setVariantName} url={variantUrl} setUrl={setVariantUrl} />

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                <input type="checkbox" checked={autoOptimize} onChange={(event) => setAutoOptimize(event.target.checked)} className="mt-0.5 h-4 w-4" />
                <span><span className="block text-sm font-semibold text-emerald-300">Enable Autopilot</span><span className="mt-0.5 block text-xs leading-5 text-slate-500">Allocation can move only after sample, confidence, and sequential evidence thresholds are satisfied.</span></span>
              </label>
              <button disabled={creating || links.length === 0} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 py-3 font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-40"><Plus className="h-4 w-4" />{creating ? 'Creating…' : 'Create adaptive campaign'}</button>
              {links.length === 0 && <p className="text-center text-xs text-amber-400">Create a short link first. Campaign traffic always enters through a permanent link.</p>}
            </div>
          </form>

          <section className="space-y-4">
            {loading ? <LoadingState /> : campaigns.length === 0 ? <EmptyState /> : campaigns.map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} busy={busyId === campaign.id} expanded={expandedId === campaign.id} onToggle={() => setExpandedId(expandedId === campaign.id ? null : campaign.id)} onAction={(action) => void campaignAction(campaign.id, action)} />)}
          </section>
        </section>
      </div>
    </main>
  )
}

function VariantEditor({ label, name, setName, url, setUrl }: { label: string; name: string; setName: (value: string) => void; url: string; setUrl: (value: string) => void }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-950 p-4"><span className="text-[10px] font-semibold tracking-[0.16em] text-slate-500">{label}</span><input value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full bg-transparent text-sm font-medium outline-none" /><input value={url} onChange={(event) => setUrl(event.target.value)} type="url" placeholder="https://example.com/landing" required className="mt-2 w-full border-t border-slate-800 bg-transparent pt-2 text-sm text-slate-400 outline-none placeholder:text-slate-700" /></div>
}

function CampaignCard({ campaign, busy, expanded, onToggle, onAction }: { campaign: Campaign; busy: boolean; expanded: boolean; onToggle: () => void; onAction: (action: 'start' | 'autopilot' | 'pause') => void }) {
  const totalClicks = campaign.variants.reduce((sum, variant) => sum + variant.clicks, 0)
  const totalConversions = campaign.variants.reduce((sum, variant) => sum + variant.conversions, 0)
  const cvr = totalClicks ? totalConversions / totalClicks : 0
  const activeAnomalies = campaign.anomalies.filter((anomaly) => !anomaly.resolvedAt)
  const latestDecision = campaign.decisions[0]
  const liveLink = campaign.links[0]?.url

  return <article className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50">
    <div className="p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-semibold text-white">{campaign.name}</h3>
            <StatusBadge status={campaign.status} />
            {campaign.autoOptimize && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300"><Activity className="h-3 w-3" /> Autopilot</span>}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500"><span>{objectiveLabels[campaign.objective]}</span><span>Config v{campaign.version}</span>{liveLink && <Link href={`/analytics/${liveLink.shortCode}`} className="font-mono text-blue-400 hover:text-blue-300">/{liveLink.shortCode} <ArrowUpRight className="inline h-3 w-3" /></Link>}</div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {campaign.status !== 'running' && campaign.status !== 'completed' && campaign.status !== 'archived' && <ActionButton disabled={busy} icon={<Play className="h-3.5 w-3.5" />} onClick={() => onAction('start')}>Start</ActionButton>}
          {campaign.status === 'running' && campaign.autoOptimize && <ActionButton disabled={busy} tone="success" icon={<Activity className="h-3.5 w-3.5" />} onClick={() => onAction('autopilot')}>Run Autopilot</ActionButton>}
          {campaign.status === 'running' && <ActionButton disabled={busy} icon={<Pause className="h-3.5 w-3.5" />} onClick={() => onAction('pause')}>Pause</ActionButton>}
          <button onClick={onToggle} aria-expanded={expanded} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-slate-500">{expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />} {expanded ? 'Hide details' : 'Inspect'}</button>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        <Metric label="Clicks" value={totalClicks.toLocaleString()} />
        <Metric label="CVR" value={`${(cvr * 100).toFixed(2)}%`} />
        <Metric label="Evidence floor" value={`${campaign.minSampleSize.toLocaleString()} / ${campaign.minConversions} conv`} />
        <Metric label="Active alerts" value={String(activeAnomalies.length)} warning={activeAnomalies.length > 0} />
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {campaign.variants.map((variant) => <VariantPerformance key={variant.id} variant={variant} totalClicks={totalClicks} />)}
      </div>

      {latestDecision && <div className="mt-4 flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs sm:flex-row sm:items-center sm:justify-between"><span className="inline-flex items-center gap-2 text-slate-400"><CircleDot className="h-3.5 w-3.5 text-blue-400" /> Latest decision: <span className="text-slate-200">{latestDecision.reason}</span></span><span className="font-mono text-slate-600">{new Date(latestDecision.createdAt).toLocaleString()}</span></div>}
    </div>

    {expanded && <div className="border-t border-slate-800 bg-slate-950/50 p-5 sm:p-6"><DecisionCenter campaign={campaign} /></div>}
  </article>
}

function DecisionCenter({ campaign }: { campaign: Campaign }) {
  return <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
    <section><h4 className="text-sm font-semibold text-white">Decision trail</h4><p className="mt-1 text-xs text-slate-500">Every automated allocation change is retained with its evidence and actor.</p><div className="mt-4 space-y-2">{campaign.decisions.length === 0 ? <p className="rounded-xl border border-dashed border-slate-800 p-5 text-xs text-slate-600">No decisions yet. Start the campaign to begin the experiment trail.</p> : campaign.decisions.slice(0, 8).map((decision) => <div key={decision.id} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3"><div className="flex items-start justify-between gap-3"><div><div className="text-xs font-medium text-slate-200">{decision.action.replaceAll('_', ' ')}</div><p className="mt-1 text-xs leading-5 text-slate-500">{decision.reason}</p></div>{decision.confidenceBps != null && <span className="rounded-md bg-blue-500/10 px-2 py-1 font-mono text-[11px] text-blue-300">{(decision.confidenceBps / 100).toFixed(2)}%</span>}</div><div className="mt-2 text-[10px] uppercase tracking-wider text-slate-700">{decision.actorType} · {new Date(decision.createdAt).toLocaleString()}</div></div>)}</div></section>
    <section><h4 className="text-sm font-semibold text-white">Reliability signals</h4><p className="mt-1 text-xs text-slate-500">Anomalies stay visible until the signal recovers below the recovery boundary.</p><div className="mt-4 space-y-2">{campaign.anomalies.length === 0 ? <p className="rounded-xl border border-dashed border-slate-800 p-5 text-xs text-slate-600">No anomalies recorded.</p> : campaign.anomalies.slice(0, 8).map((anomaly) => <div key={anomaly.id} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3"><div className="flex items-center justify-between gap-3"><span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-200">{anomaly.severity === 'critical' || anomaly.severity === 'warning' ? <TriangleAlert className="h-3.5 w-3.5 text-amber-400" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}{anomaly.type.replaceAll('_', ' ')}</span><span className="text-[11px] text-slate-600">{anomaly.resolvedAt ? 'Recovered' : 'Active'}</span></div><div className="mt-2 flex justify-between text-xs text-slate-500"><span>{anomaly.metric}</span><span>{anomaly.observed.toFixed(0)} vs {anomaly.baseline.toFixed(0)} baseline</span></div><div className="mt-1 text-[11px] text-slate-600">{anomaly.deviation.toFixed(2)}σ · {new Date(anomaly.startedAt).toLocaleString()}</div></div>)}</div></section>
  </div>
}

function VariantPerformance({ variant, totalClicks }: { variant: Variant; totalClicks: number }) {
  const cvr = variant.clicks ? variant.conversions / variant.clicks : 0
  const allocation = totalClicks ? variant.clicks / totalClicks : variant.weight / 100
  return <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4"><div className="flex items-center justify-between gap-4"><div className="min-w-0"><div className="flex items-center gap-2"><span className="truncate text-sm font-medium text-slate-200">{variant.name}</span>{variant.isControl && <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-semibold text-slate-400">CONTROL</span>}</div><p className="mt-1 truncate text-xs text-slate-600">{variant.destinationUrl}</p></div><span className="font-mono text-sm text-blue-300">{variant.weight}%</span></div><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(100, Math.max(0, allocation * 100))}%` }} /></div><div className="mt-3 grid grid-cols-3 gap-3 text-xs"><div><span className="text-slate-600">Clicks</span><div className="mt-1 font-semibold text-slate-200">{variant.clicks.toLocaleString()}</div></div><div><span className="text-slate-600">CVR</span><div className="mt-1 font-semibold text-slate-200">{(cvr * 100).toFixed(2)}%</div></div><div><span className="text-slate-600">Value</span><div className="mt-1 font-semibold text-slate-200">{(Number(variant.valueCents) / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}</div></div></div></div>
}

function Metric({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) { return <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><div className="text-[10px] uppercase tracking-wider text-slate-600">{label}</div><div className={`mt-1 font-semibold ${warning ? 'text-amber-300' : 'text-slate-200'}`}>{value}</div></div> }
function StatusBadge({ status }: { status: string }) { return <span className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-[11px] font-semibold capitalize text-slate-400">{status}</span> }
function ActionButton({ onClick, disabled, icon, children, tone = 'default' }: { onClick: () => void; disabled: boolean; icon: React.ReactNode; children: React.ReactNode; tone?: 'default' | 'success' }) { return <button disabled={disabled} onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40 ${tone === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15' : 'border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500'}`}>{icon}{children}</button> }
function LoadingState() { return <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-10 text-sm text-slate-500">Loading campaign control plane…</div> }
function EmptyState() { return <div className="rounded-2xl border border-dashed border-slate-800 p-12 text-center"><Target className="mx-auto h-8 w-8 text-slate-700" /><h3 className="mt-4 font-medium text-slate-300">No adaptive campaigns yet</h3><p className="mx-auto mt-1 max-w-md text-sm text-slate-600">Create one from the panel, attach it to a permanent short link, and let the campaign become the optimization layer behind that URL.</p></div> }

function BulkCampaignActions({campaigns,onDone}:{campaigns:Campaign[];onDone:()=>void}) {
 const [selected,setSelected]=useState<string[]>([]); const [busy,setBusy]=useState(false)
 async function run(action:'start'|'pause'|'archive'){if(!selected.length)return toast.error('Select at least one campaign');setBusy(true);try{const r=await fetch('/api/campaigns/bulk?workspaceId='+encodeURIComponent(new URLSearchParams(window.location.search).get('workspaceId')||''),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({campaignIds:selected,action})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Bulk operation failed');toast.success(`${d.updated} campaigns updated`);setSelected([]);onDone()}catch(e){toast.error(e instanceof Error?e.message:'Bulk operation failed')}finally{setBusy(false)}}
 return <div className="flex flex-wrap gap-2"><select aria-label="Select campaigns" multiple value={selected} onChange={e=>setSelected(Array.from(e.target.selectedOptions,o=>o.value))} className="input min-w-52" size={Math.min(4,Math.max(2,campaigns.length))}>{campaigns.map(c=><option key={c.id} value={c.id}>{c.name} · {c.status}</option>)}</select><button disabled={busy||!selected.length} onClick={()=>void run('start')} className="rounded-lg border border-emerald-500/30 px-3 py-2 text-xs text-emerald-300 disabled:opacity-40">Start</button><button disabled={busy||!selected.length} onClick={()=>void run('pause')} className="rounded-lg border border-amber-500/30 px-3 py-2 text-xs text-amber-300 disabled:opacity-40">Pause</button><button disabled={busy||!selected.length} onClick={()=>void run('archive')} className="rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-300 disabled:opacity-40">Archive</button></div>
}