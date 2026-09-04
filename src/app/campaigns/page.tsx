'use client'

import { RefreshCw, Target } from 'lucide-react'
import { Toaster } from 'react-hot-toast'
import { BulkCampaignActions } from './components/BulkCampaignActions'
import { CampaignList } from './components/CampaignList'
import { CreateCampaignForm } from './components/CreateCampaignForm'
import { useCampaigns } from './components/useCampaigns'

export default function CampaignsPage() {
  const {
    campaigns,
    links,
    loading,
    error,
    creating,
    busyId,
    primaryUrlId,
    setPrimaryUrlId,
    load,
    createCampaign,
    campaignAction,
  } = useCampaigns()

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

        <div className="mt-6">
          <BulkCampaignActions campaigns={campaigns} onDone={() => void load()} />
        </div>

        <section className="mt-8 grid gap-8 xl:grid-cols-[380px_1fr]">
          <CreateCampaignForm
            links={links}
            primaryUrlId={primaryUrlId}
            setPrimaryUrlId={setPrimaryUrlId}
            creating={creating}
            onCreate={createCampaign}
          />

          <section className="space-y-4">
            <CampaignList
              campaigns={campaigns}
              loading={loading}
              error={error}
              busyId={busyId}
              onAction={(id, action) => void campaignAction(id, action)}
              onRetry={() => void load()}
            />
          </section>
        </section>
      </div>
    </main>
  )
}
