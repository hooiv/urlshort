'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'

export function CreateWorkspaceForm({
  busy,
  onCreate,
}: {
  busy: boolean
  onCreate: (name: string) => Promise<boolean>
}) {
  const [name, setName] = useState('')

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const ok = await onCreate(name)
    if (ok) setName('')
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="space-y-2 border-t border-slate-800 pt-4">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New workspace name…"
        maxLength={80}
        className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500"
      />
      <button
        disabled={busy || !name.trim()}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-blue-500 py-2 text-xs font-semibold text-white hover:bg-blue-400 disabled:opacity-50 transition"
      >
        <Plus className="h-3.5 w-3.5" /> Create Workspace
      </button>
    </form>
  )
}
