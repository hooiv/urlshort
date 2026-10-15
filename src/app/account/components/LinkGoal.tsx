'use client'

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'

type Progress = { percent: number; remaining: number; status: 'achieved' | 'on_track' | 'behind' | 'missed'; requiredPerDay: number; actualPerDay: number; projected: number }
type Goal = { target: number | null; deadline: string | null; progress: Progress | null }

const LABEL: Record<Progress['status'], string> = { achieved: 'Achieved', on_track: 'On track', behind: 'Behind pace', missed: 'Missed' }

export default function LinkGoal({ shortCode }: { shortCode: string }) {
  const base = `/api/links/${encodeURIComponent(shortCode)}/click-target`
  const [goal, setGoal] = useState<Goal | null>(null)
  const [target, setTarget] = useState('')
  const [deadline, setDeadline] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(base)
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Could not load goal')
      setGoal(data)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load goal')
    }
  }, [base])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
  useEffect(() => { void load() }, [load])

  async function save() {
    const n = Number(target)
    if (!Number.isInteger(n) || n < 1) return toast.error('Target must be a whole number of clicks')
    if (!deadline) return toast.error('Pick a deadline')
    setBusy(true)
    try {
      const res = await fetch(base, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target: n, deadline: new Date(`${deadline}T23:59:59`).toISOString() }) })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Could not save goal')
      setGoal(data)
      toast.success('Goal saved')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save goal')
    } finally {
      setBusy(false)
    }
  }

  async function clear() {
    setBusy(true)
    try {
      const res = await fetch(base, { method: 'DELETE' })
      if (!res.ok) throw new Error('Could not clear goal')
      setGoal({ target: null, deadline: null, progress: null })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not clear goal')
    } finally {
      setBusy(false)
    }
  }

  if (!goal) return <p className="text-xs text-gray-500">Loading goal…</p>
  const p = goal.progress
  return (
    <div className="mt-3 rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-700">
      {p && goal.target && goal.deadline ? (
        <div className="space-y-2">
          <div className="flex justify-between"><span className="font-medium">{LABEL[p.status]}</span><span>{p.percent}% of {goal.target.toLocaleString()} clicks</span></div>
          <div className="h-2 rounded bg-gray-200 dark:bg-gray-700" role="progressbar" aria-valuenow={Math.min(100, p.percent)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-2 rounded bg-blue-600" style={{ width: `${Math.min(100, p.percent)}%` }} />
          </div>
          <p className="text-xs text-gray-500">By {new Date(goal.deadline).toLocaleDateString()}: {p.remaining.toLocaleString()} to go, need {p.requiredPerDay}/day, averaging {p.actualPerDay}/day, projected {p.projected.toLocaleString()}.</p>
          <button type="button" disabled={busy} onClick={() => void clear()} className="text-xs text-red-600 underline">Remove goal</button>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs">Target clicks<input type="number" min={1} value={target} onChange={(e) => setTarget(e.target.value)} className="mt-1 block w-28 rounded border px-2 py-1 text-sm" /></label>
          <label className="text-xs">Deadline<input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="mt-1 block rounded border px-2 py-1 text-sm" /></label>
          <button type="button" disabled={busy} onClick={() => void save()} className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50">Set goal</button>
        </div>
      )}
    </div>
  )
}
