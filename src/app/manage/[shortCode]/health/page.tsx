'use client'

import { useParams } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { Toaster } from 'react-hot-toast'
import AccessDenied from '@/app/manage/[shortCode]/health/components/AccessDenied'
import CircuitBreakerPanel from '@/app/manage/[shortCode]/health/components/CircuitBreakerPanel'
import LatencyTimeline from '@/app/manage/[shortCode]/health/components/LatencyTimeline'
import MetricsGrid from '@/app/manage/[shortCode]/health/components/MetricsGrid'
import PageHeader from '@/app/manage/[shortCode]/health/components/PageHeader'
import ProbeLog from '@/app/manage/[shortCode]/health/components/ProbeLog'
import RulesList from '@/app/manage/[shortCode]/health/components/RulesList'
import StatusBanner from '@/app/manage/[shortCode]/health/components/StatusBanner'
import { useHealth } from '@/app/manage/[shortCode]/health/components/useHealth'

export default function HealthPage() {
  const { shortCode } = useParams<{ shortCode: string }>()
  const {
    token,
    data,
    loading,
    checking,
    checkingAll,
    probeStats,
    check,
    checkAll,
    toggleFailover,
  } = useHealth(shortCode)

  if (!token) return <AccessDenied shortCode={shortCode} />
  if (!data && loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-500">
        <RefreshCw className="h-4 w-4 animate-spin text-blue-400 mr-2" />
        Loading reliability telemetry…
      </div>
    )
  }
  if (!data) return null

  const status = data.url.healthStatus

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20">
      <Toaster position="top-right" />

      <PageHeader shortCode={shortCode} />

      <main className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        {/* Status Banner */}
        <StatusBanner
          status={status}
          checkedAt={data.url.healthCheckedAt}
          checkingFallback={checking === 'fallback'}
          checkingAll={checkingAll}
          failoverEnabled={data.url.autoFailoverEnabled}
          onProbeFallback={() => void check('fallback')}
          onSweepAll={() => void checkAll()}
          onToggleFailover={() => void toggleFailover()}
        />

        {/* Metrics Grid */}
        <MetricsGrid data={data} probeStats={probeStats} />

        {/* Latency History Visualizer */}
        <LatencyTimeline checks={data.checks} stats={probeStats} />

        {/* Routing Targets & Circuit Breaker Logic */}
        <section className="grid gap-8 lg:grid-cols-2">
          {/* Circuit Breaker Settings */}
          <CircuitBreakerPanel
            autoFailoverEnabled={data.url.autoFailoverEnabled}
            lastHealthyRevisionId={data.url.lastHealthyRevisionId}
          />

          {/* Active Routing Rules Health */}
          <RulesList rules={data.rules} checking={checking} onCheck={(id) => void check(id)} />
        </section>

        {/* Detailed Probe History Logs */}
        <ProbeLog checks={data.checks} />
      </main>
    </div>
  )
}
