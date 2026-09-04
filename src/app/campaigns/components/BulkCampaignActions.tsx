'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import type { Campaign } from './types'
import { buildBulkUrl, readWorkspaceIdFromSearch } from './campaignLogic'

export function BulkCampaignActions({
  campaigns,
  onDone,
}: {
  campaigns: Campaign[]
  onDone: () => void
}) {
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  async function run(action: 'start' | 'pause' | 'archive') {
    if (!selected.length) return toast.error('Select at least one campaign')
    setBusy(true)
    try {
      const workspaceId = typeof window !== 'undefined' ? readWorkspaceIdFromSearch(window.location.search) : ''
      const response = await fetch(buildBulkUrl(workspaceId), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ campaignIds: selected, action }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Bulk operation failed')
      toast.success(`${data.updated} campaigns updated`)
      setSelected([])
      onDone()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bulk operation failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <select
        aria-label="Select campaigns"
        multiple
        value={selected}
        onChange={(event) => setSelected(Array.from(event.target.selectedOptions, (o) => o.value))}
        className="input min-w-52"
        size={Math.min(4, Math.max(2, campaigns.length))}
      >
        {campaigns.map((campaign) => (
          <option key={campaign.id} value={campaign.id}>
            {campaign.name} · {campaign.status}
          </option>
        ))}
      </select>
      <button
        disabled={busy || !selected.length}
        onClick={() => void run('start')}
        className="rounded-lg border border-emerald-500/30 px-3 py-2 text-xs text-emerald-300 disabled:opacity-40"
      >
        Start
      </button>
      <button
        disabled={busy || !selected.length}
        onClick={() => void run('pause')}
        className="rounded-lg border border-amber-500/30 px-3 py-2 text-xs text-amber-300 disabled:opacity-40"
      >
        Pause
      </button>
      <button
        disabled={busy || !selected.length}
        onClick={() => void run('archive')}
        className="rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-300 disabled:opacity-40"
      >
        Archive
      </button>
    </div>
  )
}
