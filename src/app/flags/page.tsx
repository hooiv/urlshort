'use client'

import Link from 'next/link'
import { ArrowLeft, Flag } from 'lucide-react'
import { Toaster } from 'react-hot-toast'
import FlagsEditor from '@/app/flags/components/FlagsEditor'
import FlagsList from '@/app/flags/components/FlagsList'
import WorkspaceSelect from '@/app/flags/components/WorkspaceSelect'
import { useFlagsData } from '@/app/flags/components/useFlagsData'

export default function FlagsPage() {
  const {
    workspaces,
    selected,
    setSelected,
    flags,
    workspacesError,
    flagsError,
    loadingWorkspaces,
    loadingFlags,
    key,
    setKey,
    enabled,
    setEnabled,
    rollout,
    setRollout,
    busy,
    save,
  } = useFlagsData()

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <Toaster />
      <header className="border-b border-slate-800 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <Link href="/account" aria-label="Back to account">
            <ArrowLeft />
          </Link>
          <Flag className="text-blue-400" />
          <div>
            <h1 className="font-semibold">Feature flags</h1>
            <p className="text-xs text-slate-500">Deterministic rollout with an audit trail</p>
          </div>
        </div>
      </header>
      <section className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        <WorkspaceSelect
          workspaces={workspaces}
          selected={selected}
          loading={loadingWorkspaces}
          error={workspacesError}
          onChange={setSelected}
        />
        <FlagsEditor
          flagKey={key}
          enabled={enabled}
          rollout={rollout}
          busy={busy}
          onKeyChange={setKey}
          onEnabledChange={setEnabled}
          onRolloutChange={setRollout}
          onSave={() => void save()}
        />
        <FlagsList flags={flags} loading={loadingFlags} error={flagsError} />
      </section>
    </main>
  )
}
