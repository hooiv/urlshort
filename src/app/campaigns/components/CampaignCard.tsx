'use client'

import Link from 'next/link'
import { Activity, ArrowUpRight, ChevronDown, ChevronUp, CircleDot, Pause, Play } from 'lucide-react'
import { formatNumber } from '@/lib/format'
import type { Campaign, CampaignAction } from './types'
import { objectiveLabels } from './types'
import {
  calculateTotals,
  formatCvr,
  formatEvidenceFloor,
  getActiveAnomalies,
  getLatestDecision,
  getLiveLink,
} from './campaignLogic'
import { DecisionCenter } from './DecisionCenter'
import { VariantPerformance } from './VariantPerformance'

function Metric({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-600">{label}</div>
      <div className={`mt-1 font-semibold ${warning ? 'text-amber-300' : 'text-slate-200'}`}>{value}</div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-[11px] font-semibold capitalize text-slate-400">
      {status}
    </span>
  )
}

function ActionButton({
  onClick,
  disabled,
  icon,
  children,
  tone = 'default',
}: {
  onClick: () => void
  disabled: boolean
  icon: React.ReactNode
  children: React.ReactNode
  tone?: 'default' | 'success'
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40 ${tone === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15' : 'border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500'}`}
    >
      {icon}
      {children}
    </button>
  )
}

export function CampaignCard({
  campaign,
  busy,
  expanded,
  onToggle,
  onAction,
}: {
  campaign: Campaign
  busy: boolean
  expanded: boolean
  onToggle: () => void
  onAction: (action: CampaignAction) => void
}) {
  const { totalClicks, cvr } = calculateTotals(campaign.variants)
  const activeAnomalies = getActiveAnomalies(campaign.anomalies)
  const latestDecision = getLatestDecision(campaign.decisions)
  const liveLink = getLiveLink(campaign.links)
  const variants = campaign.variants ?? []

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50">
      <div className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xl font-semibold text-white">{campaign.name}</h3>
              <StatusBadge status={campaign.status} />
              {campaign.autoOptimize && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                  <Activity className="h-3 w-3" /> Autopilot
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span>{objectiveLabels[campaign.objective] ?? campaign.objective}</span>
              <span>Config v{campaign.version}</span>
              {liveLink && (
                <Link
                  href={`/analytics/${liveLink.shortCode}`}
                  className="font-mono text-blue-400 hover:text-blue-300"
                >
                  /{liveLink.shortCode} <ArrowUpRight className="inline h-3 w-3" />
                </Link>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {campaign.status !== 'running' && campaign.status !== 'completed' && campaign.status !== 'archived' && (
              <ActionButton disabled={busy} icon={<Play className="h-3.5 w-3.5" />} onClick={() => onAction('start')}>
                Start
              </ActionButton>
            )}
            {campaign.status === 'running' && campaign.autoOptimize && (
              <ActionButton
                disabled={busy}
                tone="success"
                icon={<Activity className="h-3.5 w-3.5" />}
                onClick={() => onAction('autopilot')}
              >
                Run Autopilot
              </ActionButton>
            )}
            {campaign.status === 'running' && (
              <ActionButton disabled={busy} icon={<Pause className="h-3.5 w-3.5" />} onClick={() => onAction('pause')}>
                Pause
              </ActionButton>
            )}
            <button
              onClick={onToggle}
              aria-expanded={expanded}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-slate-500"
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}{' '}
              {expanded ? 'Hide details' : 'Inspect'}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          <Metric label="Clicks" value={formatNumber(totalClicks)} />
          <Metric label="CVR" value={formatCvr(cvr)} />
          <Metric label="Evidence floor" value={formatEvidenceFloor(campaign.minSampleSize, campaign.minConversions)} />
          <Metric label="Active alerts" value={String(activeAnomalies.length)} warning={activeAnomalies.length > 0} />
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {variants.map((variant) => (
            <VariantPerformance key={variant.id} variant={variant} totalClicks={totalClicks} currency={campaign.currency} />
          ))}
        </div>

        {latestDecision && (
          <div className="mt-4 flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs sm:flex-row sm:items-center sm:justify-between">
            <span className="inline-flex items-center gap-2 text-slate-400">
              <CircleDot className="h-3.5 w-3.5 text-blue-400" /> Latest decision:{' '}
              <span className="text-slate-200">{latestDecision.reason}</span>
            </span>
            <span className="font-mono text-slate-600">{new Date(latestDecision.createdAt).toLocaleString()}</span>
          </div>
        )}
      </div>

      {expanded && (
        <div className="border-t border-slate-800 bg-slate-950/50 p-5 sm:p-6">
          <DecisionCenter campaign={campaign} />
        </div>
      )}
    </article>
  )
}
