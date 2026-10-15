'use client'

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Clock } from 'lucide-react'
import Field from '@/app/manage/[shortCode]/components/Field'
import type { ActiveWindow } from '@/lib/active-hours'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MAX_WINDOWS = 14

const defaultWindow = (): ActiveWindow => ({ days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' })

export default function ActiveHoursSection({ shortCode, token }: { shortCode: string; token: string }) {
  const endpoint = `/api/links/${encodeURIComponent(shortCode)}`
  const [enabled, setEnabled] = useState(false)
  const [timezone, setTimezone] = useState('UTC')
  const [windows, setWindows] = useState<ActiveWindow[]>([defaultWindow()])
  const [offHoursUrl, setOffHoursUrl] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(endpoint, { headers: { 'x-management-token': token } })
        const link = await res.json()
        if (cancelled || !res.ok) return
        if (link.activeHours?.windows?.length) {
          setEnabled(true)
          setTimezone(link.activeHours.timezone)
          setWindows(link.activeHours.windows)
        } else if (browserTz) {
          setTimezone(browserTz)
        }
        setOffHoursUrl(link.offHoursUrl || '')
      } catch {
        /* the campaign controls surface load errors */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [endpoint, token])

  const update = (i: number, patch: Partial<ActiveWindow>) =>
    setWindows((prev) => prev.map((w, idx) => (idx === i ? { ...w, ...patch } : w)))

  const toggleDay = (i: number, day: number) =>
    setWindows((prev) =>
      prev.map((w, idx) => {
        if (idx !== i) return w
        const days = w.days.includes(day) ? w.days.filter((d) => d !== day) : [...w.days, day].sort()
        return { ...w, days }
      }),
    )

  const save = useCallback(async () => {
    if (enabled && windows.some((w) => w.days.length === 0)) {
      toast.error('Pick at least one day for every window')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-management-token': token },
        body: JSON.stringify({
          activeHours: enabled ? { timezone, windows } : null,
          offHoursUrl: enabled ? offHoursUrl.trim() || null : null,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Could not save active hours')
      toast.success(enabled ? 'Active hours saved' : 'Active hours removed')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }, [enabled, endpoint, offHoursUrl, timezone, token, windows])

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-sky-400" />
        <h2 className="font-semibold text-white">Active Hours</h2>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        Redirect only inside weekly windows (DST-aware); everyone else goes to the off-hours destination.
      </p>
      <label className="mt-4 flex items-center gap-2 text-xs text-slate-300">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Restrict this link to active hours
      </label>

      {enabled && (
        <div className="mt-4 space-y-4">
          <Field label="Timezone (IANA, e.g. America/New_York)">
            <input value={timezone} onChange={(e) => setTimezone(e.target.value)} className="input" />
          </Field>
          {windows.map((w, i) => (
            <div key={i} className="rounded-xl border border-slate-800 p-3 space-y-3">
              <div className="flex flex-wrap gap-1">
                {DAYS.map((label, d) => (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={w.days.includes(d)}
                    onClick={() => toggleDay(i, d)}
                    className={`rounded-lg px-2 py-1 text-xs ${
                      w.days.includes(d) ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <input type="time" value={w.start} onChange={(e) => update(i, { start: e.target.value })} className="input" />
                <span>to</span>
                <input type="time" value={w.end} onChange={(e) => update(i, { end: e.target.value })} className="input" />
                {windows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setWindows((prev) => prev.filter((_, idx) => idx !== i))}
                    className="text-rose-400 hover:text-rose-300"
                  >
                    Remove
                  </button>
                )}
              </div>
              {w.end <= w.start && <p className="text-[11px] text-slate-500">Ends after midnight (wraps to the next day).</p>}
            </div>
          ))}
          {windows.length < MAX_WINDOWS && (
            <button
              type="button"
              onClick={() => setWindows((prev) => [...prev, defaultWindow()])}
              className="text-xs text-sky-400 hover:text-sky-300"
            >
              + Add window
            </button>
          )}
          <Field label="Off-hours destination (optional)">
            <input
              type="url"
              value={offHoursUrl}
              onChange={(e) => setOffHoursUrl(e.target.value)}
              placeholder="https://example.com/closed"
              className="input"
            />
          </Field>
        </div>
      )}
      <button
        onClick={() => void save()}
        disabled={saving}
        className="mt-4 rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save Active Hours'}
      </button>
    </section>
  )
}
