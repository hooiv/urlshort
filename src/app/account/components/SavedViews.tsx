'use client'

import { useCallback, useEffect, useState } from 'react'

type View = { id: string; name: string; filters: { q?: string; tags?: string[] } }

/** Save the current search + tag filter as a named view and re-apply it in one click. */
export default function SavedViews({
  search,
  activeTag,
  onApply,
}: {
  search: string
  activeTag: string
  onApply: (filters: { q: string; tag: string }) => void
}) {
  const [views, setViews] = useState<View[]>([])
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const res = await fetch('/api/views')
    if (res.ok) setViews((await res.json()).views ?? [])
  }, [])
  useEffect(() => {
    let cancelled = false
    fetch('/api/views')
      .then((res) => (res.ok ? res.json() : { views: [] }))
      .then((data) => { if (!cancelled) setViews(data.views ?? []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const canSave = Boolean(search.trim() || activeTag) && name.trim().length > 0

  async function save() {
    setError('')
    const filters: { q?: string; tags?: string[] } = {}
    if (search.trim()) filters.q = search.trim()
    if (activeTag) filters.tags = [activeTag]
    const res = await fetch('/api/views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), filters }),
    })
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? 'Could not save view'); return }
    setName('')
    await load()
  }

  async function remove(id: string) {
    const res = await fetch(`/api/views/${id}`, { method: 'DELETE' })
    if (res.ok) setViews((cur) => cur.filter((v) => v.id !== id))
  }

  if (!views.length && !search && !activeTag) return null
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2" aria-label="Saved views">
      {views.map((v) => (
        <span key={v.id} className="inline-flex items-center rounded-full border border-slate-700 text-xs text-slate-300">
          <button type="button" className="px-3 py-1 hover:text-white" onClick={() => onApply({ q: v.filters.q ?? '', tag: v.filters.tags?.[0] ?? '' })}>{v.name}</button>
          <button type="button" aria-label={`Delete view ${v.name}`} className="pr-2 text-slate-500 hover:text-red-400" onClick={() => remove(v.id)}>×</button>
        </span>
      ))}
      {(search || activeTag) && (
        <span className="inline-flex items-center gap-1">
          <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Save this filter as…" className="input h-8 w-44 text-xs" />
          <button type="button" disabled={!canSave} onClick={save} className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 disabled:opacity-40">Save</button>
        </span>
      )}
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  )
}
