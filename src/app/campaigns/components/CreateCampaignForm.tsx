'use client'

import { useMemo, useState } from 'react'
import { Plus, ShieldCheck } from 'lucide-react'
import { formatNumber } from '@/lib/format'
import type { LinkOption } from './types'
import { objectiveLabels } from './types'
import { VariantEditor } from './VariantEditor'

export function CreateCampaignForm({
  links,
  primaryUrlId,
  setPrimaryUrlId,
  creating,
  onCreate,
}: {
  links: LinkOption[]
  primaryUrlId: string
  setPrimaryUrlId: (value: string) => void
  creating: boolean
  onCreate: (input: {
    name: string
    slug: string
    primaryUrlId: string
    objective: string
    autoOptimize: boolean
    controlName: string
    variantName: string
    controlUrl: string
    variantUrl: string
  }) => Promise<boolean>
}) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [objective, setObjective] = useState('conversion_rate')
  const [autoOptimize, setAutoOptimize] = useState(true)
  const [controlName, setControlName] = useState('Control')
  const [variantName, setVariantName] = useState('Variant B')
  const [controlUrl, setControlUrl] = useState('')
  const [variantUrl, setVariantUrl] = useState('')

  const selectedLink = useMemo(
    () => links.find((link) => link.id === primaryUrlId) || null,
    [links, primaryUrlId]
  )

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const ok = await onCreate({
      name,
      slug,
      primaryUrlId,
      objective,
      autoOptimize,
      controlName,
      variantName,
      controlUrl,
      variantUrl,
    })
    if (ok) {
      setName('')
      setSlug('')
      setControlName('Control')
      setVariantName('Variant B')
      // Reset the control destination to the currently selected entry link so the
      // next campaign starts from a sane default instead of a stale URL.
      const current = links.find((link) => link.id === primaryUrlId)
      setControlUrl(current?.originalUrl || '')
      setVariantUrl('')
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-xl shadow-black/20 sm:p-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-white">Launch an adaptive campaign</h2>
          <p className="mt-1 text-xs text-slate-500">
            The entry link is the permanent asset. Destinations can change without changing what you print
            or publish.
          </p>
        </div>
        <ShieldCheck className="h-5 w-5 text-emerald-400" />
      </div>

      <div className="mt-6 space-y-4">
        <label className="block">
          <span className="field-label">Entry short link</span>
          <select
            value={primaryUrlId}
            onChange={(event) => {
              setPrimaryUrlId(event.target.value)
              const option = links.find((link) => link.id === event.target.value)
              if (option) setControlUrl(option.originalUrl)
            }}
            required
            className="input mt-2 w-full"
          >
            <option value="">Choose a permanent link…</option>
            {links.map((link) => (
              <option key={link.id} value={link.id}>
                /{link.shortCode} {link.title ? `— ${link.title}` : ''}
              </option>
            ))}
          </select>
        </label>
        {selectedLink && (
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-blue-300">/{selectedLink.shortCode}</span>
              <span className="text-slate-500">{formatNumber(selectedLink.clicks)} clicks</span>
            </div>
            <p className="mt-1 truncate text-slate-500">{selectedLink.originalUrl}</p>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className="field-label">Campaign name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Spring launch"
              required
              maxLength={160}
              className="input mt-2 w-full"
            />
          </label>
          <label>
            <span className="field-label">Slug</span>
            <input
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              placeholder="spring-launch"
              required
              pattern="[a-z0-9][a-z0-9-]{1,62}"
              className="input mt-2 w-full font-mono"
            />
          </label>
        </div>

        <label>
          <span className="field-label">Optimization objective</span>
          <select value={objective} onChange={(event) => setObjective(event.target.value)} className="input mt-2 w-full">
            {Object.entries(objectiveLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <VariantEditor label="CONTROL" name={controlName} setName={setControlName} url={controlUrl} setUrl={setControlUrl} />
        <VariantEditor label="VARIANT B" name={variantName} setName={setVariantName} url={variantUrl} setUrl={setVariantUrl} />

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
          <input
            type="checkbox"
            checked={autoOptimize}
            onChange={(event) => setAutoOptimize(event.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            <span className="block text-sm font-semibold text-emerald-300">Enable Autopilot</span>
            <span className="mt-0.5 block text-xs leading-5 text-slate-500">
              Allocation can move only after sample, confidence, and sequential evidence thresholds are
              satisfied.
            </span>
          </span>
        </label>
        <button
          disabled={creating || links.length === 0}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 py-3 font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
          {creating ? 'Creating…' : 'Create adaptive campaign'}
        </button>
        {links.length === 0 && (
          <p className="text-center text-xs text-amber-400">
            Create a short link first. Campaign traffic always enters through a permanent link.
          </p>
        )}
      </div>
    </form>
  )
}
