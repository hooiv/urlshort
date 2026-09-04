'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  ArrowLeft,
  Copy,
  DollarSign,
  Download,
  ExternalLink,
  Filter,
  Globe2,
  Laptop,
  Layers,
  MousePointerClick,
  QrCode,
  RefreshCw,
  Smartphone,
  Sparkles,
  Tag,
  Target,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'
import { formatCurrency, formatNumber } from '@/lib/format'
import BreakdownCard, { TechBar } from './components/BreakdownCard'
import ExperimentDecisionHub from './components/ExperimentDecisionHub'
import KpiCard from './components/KpiCard'
import QrStudioPanel from './components/QrStudioPanel'
import TabButton from './components/TabButton'
import TimeSeriesChart from './components/TimeSeriesChart'
import UtmList from './components/UtmList'
import type { ActiveTab, ChartMetric } from './components/types'
import { useAnalyticsData } from './hooks/useAnalyticsData'

const RANGES = [
  { key: '24h', label: '24 Hours' },
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
  { key: '90d', label: '90 Days' },
  { key: 'all', label: 'All Time' },
]

export default function AnalyticsPage() {
  const { shortCode } = useParams<{ shortCode: string }>()
  const [range, setRange] = useState('30d')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview')
  const [chartMetric, setChartMetric] = useState<ChartMetric>('both')

  // Filter state
  const [filterCountry, setFilterCountry] = useState<string | null>(null)
  const [filterDevice, setFilterDevice] = useState<string | null>(null)
  const [filterReferrer, setFilterReferrer] = useState<string | null>(null)

  // QR modal
  const [showQr, setShowQr] = useState(false)
  const [qrDark, setQrDark] = useState('#0f172a')
  const [qrLight, setQrLight] = useState('#ffffff')

  const { data, error, loading, refetch: fetchAnalytics } = useAnalyticsData(
    shortCode,
    range,
    filterCountry,
    filterDevice,
    filterReferrer,
    autoRefresh
  )

  async function copyToClipboard(text: string, label = 'Copied') {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(label)
    } catch {
      toast.error('Clipboard access failed')
    }
  }

  async function promoteWinner(ruleId: string) {
    if (!shortCode) return
    try {
      const token = sessionStorage.getItem(`ql-token:${shortCode}`)
      const res = await fetch(`/api/links/${encodeURIComponent(shortCode)}/promote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-management-token': token || '',
        },
        body: JSON.stringify({ ruleId }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Failed to promote winner')
      toast.success(`Promoted "${result.promotedRule?.name}" as the new default destination!`)
      void fetchAnalytics(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Promotion failed')
    }
  }

  if (error && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
        <div className="max-w-md rounded-2xl border border-red-500/20 bg-slate-900 p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10 text-red-400">
            <X className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-lg font-semibold">Analytics Unavailable</h1>
          <p className="mt-2 text-sm text-slate-400">{error}</p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/" className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium hover:bg-slate-700">
              Home
            </Link>
            <button onClick={() => void fetchAnalytics()} className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-400">
              Try Again
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-500">
        <div className="flex items-center gap-3">
          <RefreshCw className="h-5 w-5 animate-spin text-blue-400" />
          <span>Aggregating real-time campaign intelligence…</span>
        </div>
      </div>
    )
  }

  const { url, analytics, window: winInfo } = data
  const hasActiveFilters = Boolean(filterCountry || filterDevice || filterReferrer)

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Toaster position="top-right" />

      {/* Navigation Header */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/"
              className="rounded-lg border border-slate-800 bg-slate-900/80 p-2 text-slate-400 transition hover:border-slate-700 hover:text-white"
              title="Return to Home"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white truncate">{url.title || `Campaign /${url.shortCode}`}</span>
                <span className="rounded bg-blue-500/10 px-1.5 py-0.5 font-mono text-[11px] font-medium text-blue-400">
                  /{url.shortCode}
                </span>
                <button
                  onClick={() => {
                    const linkUrl = typeof window !== 'undefined' ? `${window.location.origin}/${url.shortCode}` : `/${url.shortCode}`
                    void copyToClipboard(linkUrl, 'Short link copied')
                  }}
                  className="rounded p-1 text-slate-500 hover:bg-slate-900 hover:text-white"
                  title="Copy short link"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>
              <p className="truncate text-xs text-slate-400">{url.originalUrl}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Live Auto-Refresh Toggle */}
            <button
              onClick={() => setAutoRefresh((v) => !v)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                autoRefresh
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                  : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
              title={autoRefresh ? 'Live updates active (every 15s)' : 'Enable 15s auto-refresh'}
            >
              <span className={`h-2 w-2 rounded-full ${autoRefresh ? 'animate-pulse bg-emerald-400' : 'bg-slate-600'}`} />
              {autoRefresh ? 'Live Pulse' : 'Auto-refresh'}
            </button>

            {/* Manual Refresh */}
            <button
              onClick={() => void fetchAnalytics(false)}
              disabled={loading}
              className="rounded-lg border border-slate-800 bg-slate-900 p-2 text-slate-400 transition hover:border-slate-700 hover:text-white disabled:opacity-50"
              title="Refresh Data"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            {/* QR Studio */}
            <button
              onClick={() => setShowQr((v) => !v)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                showQr
                  ? 'border-blue-500/40 bg-blue-500/10 text-blue-300'
                  : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700 hover:text-white'
              }`}
            >
              <QrCode className="mr-1.5 inline h-3.5 w-3.5" />
              QR Studio
            </button>

            {/* Export CSV */}
            <a
              href={`/api/links/${encodeURIComponent(url.shortCode)}/export?range=${range}`}
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-700 hover:text-white"
            >
              <Download className="mr-1.5 inline h-3.5 w-3.5" />
              Export
            </a>

            {/* Link Management */}
            <Link
              href={`/manage/${url.shortCode}`}
              className="rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-400"
            >
              Manage Link
            </Link>
          </div>
        </div>
      </header>

      {/* QR Code Customizer Panel */}
      {showQr && (
        <QrStudioPanel
          shortCode={url.shortCode}
          dark={qrDark}
          light={qrLight}
          onDarkChange={setQrDark}
          onLightChange={setQrLight}
        />
      )}

      {/* Main Analytics Container */}
      <main className="mx-auto max-w-7xl space-y-8 px-6 py-8">
        {/* Date Window & Filter Bar */}
        <section className="flex flex-wrap items-center justify-between gap-4">
          <div className="inline-flex rounded-xl border border-slate-800 bg-slate-900/90 p-1">
            {RANGES.map((option) => (
              <button
                key={option.key}
                onClick={() => setRange(option.key)}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition ${
                  range === option.key ? 'bg-blue-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {/* Active Filter Chips */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <Filter className="h-3 w-3" /> Filters:
              </span>
              {filterCountry && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-xs text-blue-300">
                  Country: {filterCountry}
                  <button onClick={() => setFilterCountry(null)} className="hover:text-white">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {filterDevice && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-xs text-blue-300">
                  Device: {filterDevice}
                  <button onClick={() => setFilterDevice(null)} className="hover:text-white">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {filterReferrer && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-xs text-blue-300">
                  Referrer: {filterReferrer}
                  <button onClick={() => setFilterReferrer(null)} className="hover:text-white">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              <button
                onClick={() => {
                  setFilterCountry(null)
                  setFilterDevice(null)
                  setFilterReferrer(null)
                }}
                className="text-xs text-slate-500 hover:text-slate-300 underline ml-1"
              >
                Clear all
              </button>
            </div>
          )}
        </section>

        {/* Primary KPI Metrics */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            icon={<MousePointerClick className="h-5 w-5 text-blue-400" />}
            label="Total Traffic"
            value={formatNumber(analytics.windowClicks)}
            subtext={`${formatNumber(analytics.totalClicks)} all-time visits`}
          />
          <KpiCard
            icon={<Target className="h-5 w-5 text-emerald-400" />}
            label="Attributed Conversions"
            value={formatNumber(analytics.totalConversions)}
            subtext={`${(analytics.conversionRate * 100).toFixed(2)}% conversion rate`}
          />
          <KpiCard
            icon={<DollarSign className="h-5 w-5 text-amber-400" />}
            label="Attributed Revenue"
            value={formatCurrency(analytics.totalValueCents)}
            subtext={
              analytics.totalConversions
                ? `${formatCurrency(analytics.averageOrderValueCents)} avg order value`
                : 'No revenue events yet'
            }
          />
          <KpiCard
            icon={<TrendingUp className="h-5 w-5 text-violet-400" />}
            label="Revenue Per Click (RPC)"
            value={formatCurrency(analytics.revenuePerClickCents)}
            subtext="Calculated value per visitor"
          />
        </section>

        {/* Interactive SVG Time-Series Chart */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-black/20">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-lg text-white">Traffic & Conversion Dynamics</h2>
              <p className="text-xs text-slate-400">
                {winInfo.isHourly ? 'Hourly granularity' : 'Daily rollup'} · Hover to inspect data points
              </p>
            </div>

            {/* Metric Switcher */}
            <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-0.5 text-xs">
              <button
                onClick={() => setChartMetric('clicks')}
                className={`rounded px-2.5 py-1 transition ${
                  chartMetric === 'clicks' ? 'bg-blue-500 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Clicks
              </button>
              <button
                onClick={() => setChartMetric('conversions')}
                className={`rounded px-2.5 py-1 transition ${
                  chartMetric === 'conversions' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Conversions
              </button>
              <button
                onClick={() => setChartMetric('revenue')}
                className={`rounded px-2.5 py-1 transition ${
                  chartMetric === 'revenue' ? 'bg-amber-500 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Revenue
              </button>
              <button
                onClick={() => setChartMetric('both')}
                className={`rounded px-2.5 py-1 transition ${
                  chartMetric === 'both' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Combined
              </button>
            </div>
          </div>

          <div className="mt-6">
            <TimeSeriesChart
              isHourly={winInfo.isHourly}
              clicksByDate={winInfo.isHourly ? analytics.clicksByHour : analytics.clicksByDate}
              conversionByDate={winInfo.isHourly ? analytics.conversionByHour : analytics.conversionByDate}
              revenueByDate={analytics.revenueByDate}
              revenueByHour={analytics.revenueByHour}
              metric={chartMetric}
            />
          </div>
        </section>

        {/* Statistical A/B Testing Banner (if experiments exist) */}
        {analytics.experimentAnalysis && analytics.experimentAnalysis.results.length > 1 && (
          <ExperimentDecisionHub
            analysis={analytics.experimentAnalysis}
            onPromoteWinner={promoteWinner}
          />
        )}

        {/* Multi-Tab Navigation for Deep-Dives */}
        <section className="space-y-6">
          <div className="flex border-b border-slate-800 overflow-x-auto no-scrollbar">
            <TabButton
              active={activeTab === 'overview'}
              onClick={() => setActiveTab('overview')}
              icon={<Layers className="h-4 w-4" />}
              label="Overview"
            />
            <TabButton
              active={activeTab === 'geo'}
              onClick={() => setActiveTab('geo')}
              icon={<Globe2 className="h-4 w-4" />}
              label="Geo & Cities"
              badge={analytics.clicksByCountry.length}
            />
            <TabButton
              active={activeTab === 'channels'}
              onClick={() => setActiveTab('channels')}
              icon={<Zap className="h-4 w-4" />}
              label="Channels & Referrers"
              badge={analytics.clicksByReferrer.length}
            />
            <TabButton
              active={activeTab === 'tech'}
              onClick={() => setActiveTab('tech')}
              icon={<Laptop className="h-4 w-4" />}
              label="Devices & Tech"
            />
            <TabButton
              active={activeTab === 'agents'}
              onClick={() => setActiveTab('agents')}
              icon={<Zap className="h-4 w-4" />}
              label="AI & Automation"
              badge={analytics.clicksByAiAgent.length}
            />
            <TabButton
              active={activeTab === 'utm'}
              onClick={() => setActiveTab('utm')}
              icon={<Tag className="h-4 w-4" />}
              label="UTM Matrix"
              badge={analytics.utmPerformance.sources.length + analytics.utmPerformance.campaigns.length}
            />
            <TabButton
              active={activeTab === 'goals'}
              onClick={() => setActiveTab('goals')}
              icon={<Target className="h-4 w-4" />}
              label="Goals & Revenue"
              badge={analytics.goals.length}
            />
          </div>

          {/* Tab Content */}
          {activeTab === 'overview' && (
            <div className="grid gap-6 lg:grid-cols-2">
              <BreakdownCard
                title="Top Countries"
                icon={<Globe2 className="h-4 w-4 text-blue-400" />}
                items={analytics.clicksByCountry.slice(0, 6).map((c) => ({
                  id: c.code,
                  label: `${c.flag} ${c.name}`,
                  count: c.clicks,
                  percentage: c.percentage,
                  onClick: () => setFilterCountry(c.code),
                }))}
              />
              <BreakdownCard
                title="Traffic Channels"
                icon={<Zap className="h-4 w-4 text-emerald-400" />}
                items={analytics.clicksByChannel.map((c) => ({
                  id: c.channel || 'unknown',
                  label: c.channel ? c.channel.toUpperCase() : 'UNKNOWN',
                  count: c.clicks,
                  percentage: c.percentage,
                }))}
              />
              <BreakdownCard
                title="Top Referrers"
                icon={<ExternalLink className="h-4 w-4 text-violet-400" />}
                items={analytics.clicksByReferrer.slice(0, 6).map((r) => ({
                  id: r.host,
                  label: r.sourceName || r.host,
                  sublabel: r.channel,
                  count: r.clicks,
                  percentage: r.percentage,
                  onClick: () => setFilterReferrer(r.host),
                }))}
              />
              <BreakdownCard
                title="Device Breakdown"
                icon={<Smartphone className="h-4 w-4 text-amber-400" />}
                items={analytics.clicksByDevice.map((d) => ({
                  id: d.device,
                  label: d.device.toUpperCase(),
                  count: d.clicks,
                  percentage: d.percentage,
                  onClick: () => setFilterDevice(d.device),
                }))}
              />
            </div>
          )}

          {activeTab === 'geo' && (
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
                <h3 className="font-semibold text-white mb-4">Countries by Visitor Volume</h3>
                <div className="space-y-3">
                  {analytics.clicksByCountry.length ? (
                    analytics.clicksByCountry.map((c) => (
                      <div
                        key={c.code}
                        onClick={() => setFilterCountry(c.code)}
                        className="group flex cursor-pointer items-center justify-between rounded-xl border border-slate-800/80 bg-slate-950/60 p-3 transition hover:border-blue-500/40 hover:bg-slate-900"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{c.flag}</span>
                          <div>
                            <div className="text-sm font-medium text-slate-200 group-hover:text-blue-300">
                              {c.name}
                            </div>
                            <div className="text-[11px] font-mono text-slate-500">{c.code}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold text-slate-100">{formatNumber(c.clicks)}</div>
                          <div className="text-xs text-slate-500">{c.percentage}%</div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500">No geo data recorded.</p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
                <h3 className="font-semibold text-white mb-4">Top Metro Areas & Cities</h3>
                <div className="space-y-3">
                  {analytics.clicksByCity.length ? (
                    analytics.clicksByCity.map((city, idx) => (
                      <div
                        key={`${city.name}-${idx}`}
                        className="flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-950/60 p-3"
                      >
                        <div className="flex items-center gap-2.5">
                          <span>{city.flag}</span>
                          <span className="text-sm font-medium text-slate-200">{city.city}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-semibold text-slate-100">{formatNumber(city.clicks)}</span>
                          <span className="ml-2 text-xs text-slate-500">{city.percentage}%</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500">No city-level data recorded yet.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'channels' && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {analytics.clicksByChannel.map((ch) => (
                  <div key={ch.channel} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">{ch.channel}</div>
                    <div className="mt-2 text-2xl font-bold text-white">{formatNumber(ch.clicks)}</div>
                    <div className="mt-1 text-xs text-slate-500">{ch.percentage}% of traffic</div>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
                <h3 className="font-semibold text-white mb-4">Referring Domains & Traffic Sources</h3>
                <div className="divide-y divide-slate-800">
                  {analytics.clicksByReferrer.map((ref) => (
                    <div
                      key={ref.host}
                      onClick={() => setFilterReferrer(ref.host)}
                      className="group flex cursor-pointer items-center justify-between py-3.5 transition hover:text-blue-300"
                    >
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-300">
                          {ref.channel}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-slate-200 group-hover:text-blue-300">
                            {ref.sourceName}
                          </div>
                          <div className="text-xs text-slate-500">{ref.host}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-slate-100">{formatNumber(ref.clicks)}</div>
                        <div className="text-xs text-slate-500">{ref.percentage}%</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'tech' && (
            <div className="grid gap-6 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
                <h3 className="font-semibold text-white mb-4">Operating Systems</h3>
                <div className="space-y-3">
                  {analytics.clicksByOS.map((o) => (
                    <TechBar key={o.os || 'other'} label={(o.os || 'other').toUpperCase()} count={o.clicks} percentage={o.percentage} />
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
                <h3 className="font-semibold text-white mb-4">Browsers</h3>
                <div className="space-y-3">
                  {analytics.clicksByBrowser.map((b) => (
                    <TechBar key={b.browser || 'other'} label={(b.browser || 'other').toUpperCase()} count={b.clicks} percentage={b.percentage} />
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
                <h3 className="font-semibold text-white mb-4">Device Types</h3>
                <div className="space-y-3">
                  {analytics.clicksByDevice.map((d) => (
                    <TechBar
                      key={d.device}
                      label={d.device.toUpperCase()}
                      count={d.clicks}
                      percentage={d.percentage}
                      onClick={() => setFilterDevice(d.device)}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'agents' && (
            <div className="grid gap-6 lg:grid-cols-2">
              <BreakdownCard
                title="Traffic Classification"
                icon={<Zap className="h-4 w-4 text-violet-400" />}
                items={analytics.clicksByTrafficType.map((item) => ({
                  id: item.trafficType,
                  label: item.trafficType === 'ai_agent' ? 'AI agents' : item.trafficType === 'bot' ? 'Other bots' : 'Human traffic',
                  count: item.clicks,
                  percentage: item.percentage,
                }))}
              />
              <BreakdownCard
                title="AI Agent Sources"
                icon={<Sparkles className="h-4 w-4 text-emerald-400" />}
                items={analytics.clicksByAiAgent.map((item) => ({
                  id: item.aiAgent,
                  label: item.aiAgent,
                  count: item.clicks,
                  percentage: item.percentage,
                }))}
              />
              <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
                <h3 className="font-semibold text-white">AI Traffic Routing</h3>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
                  AI crawlers and AI-assisted browsers are classified separately from ordinary bots. Use a routing rule to send them to a documentation, citation, or crawler-safe destination without changing the human experience.
                </p>
                <Link href={`/manage/${url.shortCode}`} className="mt-4 inline-flex rounded-xl bg-blue-500 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-400">
                  Configure AI routing →
                </Link>
              </div>
            </div>
          )}

          {activeTab === 'utm' && (
            <div className="space-y-6">
              <div className="grid gap-6 md:grid-cols-3">
                <UtmList title="UTM Sources" items={analytics.utmPerformance.sources} />
                <UtmList title="UTM Mediums" items={analytics.utmPerformance.mediums} />
                <UtmList title="UTM Campaigns" items={analytics.utmPerformance.campaigns} />
              </div>
            </div>
          )}

          {activeTab === 'goals' && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="font-semibold text-lg text-white">Conversion Goals & Outcomes</h3>
                  <p className="text-xs text-slate-400">Tracked goals attributed to visits on this link.</p>
                </div>
                <Link
                  href={`/manage/${url.shortCode}`}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700"
                >
                  Configure Goals
                </Link>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {analytics.goals.length ? (
                  analytics.goals.map((g) => (
                    <div key={g.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-slate-200">{g.name}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            g.enabled ? 'bg-emerald-500/10 text-emerald-300' : 'bg-slate-800 text-slate-500'
                          }`}
                        >
                          {g.enabled ? 'Live' : 'Paused'}
                        </span>
                      </div>
                      <div className="mt-1 font-mono text-xs text-slate-500">{g.eventKey}</div>
                      <div className="mt-4 flex items-end justify-between">
                        <div>
                          <div className="text-2xl font-bold text-white">{formatNumber(g.conversions)}</div>
                          <div className="text-xs text-slate-500">Conversions</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold text-emerald-400">{formatCurrency(g.valueCents)}</div>
                          <div className="text-xs text-slate-500">Attributed Value</div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500 col-span-full">No conversion goals created yet.</p>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Real-time Click Stream */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-white">Live Activity Stream</h3>
              <p className="text-xs text-slate-400">Most recent visits and client signatures.</p>
            </div>
            <span className="text-xs font-mono text-slate-500">Showing last {analytics.recentClicks.length}</span>
          </div>

          <div className="divide-y divide-slate-800">
            {analytics.recentClicks.map((click) => (
              <div key={click.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between text-xs">
                <div className="flex items-center gap-3">
                  <span className="text-lg">{click.flag}</span>
                  <div>
                    <div className="font-medium text-slate-200">
                      {click.city ? `${click.city}, ${click.countryName}` : click.countryName}
                    </div>
                    <div className="text-slate-500">
                      via {click.referrerSource} ({click.channel})
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300 font-mono">
                    {click.os} · {click.browser}
                  </span>
                  <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-400">
                    {click.deviceType}
                  </span>
                  <time className="text-slate-500">{new Date(click.createdAt).toLocaleTimeString()}</time>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
