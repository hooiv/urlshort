'use client'

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { CalendarClock, Plus, Trash2 } from 'lucide-react'
import { readDestinationSchedule, MAX_DESTINATION_STEPS } from '@/lib/destination-schedule'

interface Row { local: string; url: string }

/** ISO instant -> value for <input type="datetime-local"> in the browser's zone. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function DestinationScheduleSection({ shortCode, token }: { shortCode: string; token: string }) {
  const endpoint = `/api/links/${encodeURIComponent(shortCode)}`
  const [rows, setRows] = useState<Row[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(endpoint, { headers: { 'x-management-token': token } })
        const link = await res.json()
        if (cancelled || !res.ok) return
        setRows(readDestinationSchedule(link.destinationSchedule).map((s) => ({ local: toLocalInput(s.at), url: s.url })))
      } catch {
        /* the campaign controls surface load errors */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [endpoint, token])

  const update = (i: number, patch: Partial<Row>) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)))

  const save = useCallback(async () => {
    const payload = rows.map((r) => ({ at: r.local ? new Date(r.local).toISOString() : '', url: r.url.trim() }))
    if (payload.some((p) => !p.at || !p.url)) return void toast.error('Each swap needs a date/time and a URL')
    setSaving(true)
    try {
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-management-token': token },
        body: JSON.stringify({ destinationSchedule: payload.length ? payload : null }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Could not save schedule')
      setRows(readDestinationSchedule(data?.destinationSchedule).map((s) => ({ local: toLocalInput(s.at), url: s.url })))
      toast.success(payload.length ? 'Schedule saved' : 'Schedule cleared')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }, [endpoint, rows, token])

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-sky-400" />
        <h2 className="font-semibold text-white">Scheduled Destination Swaps</h2>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        From each time onward the link goes to that URL, until the next swap. Smart-routing rules and running campaigns still take priority. Times use your browser&apos;s time zone.
      </p>
      <div className="mt-4 space-y-3">
        {rows.map((row, i) => (
          <div key={i} className="flex flex-col gap-2 sm:flex-row">
            <input type="datetime-local" aria-label={`Swap ${i + 1} time`} value={row.local} onChange={(e) => update(i, { local: e.target.value })} className="input sm:w-56" />
            <input type="url" aria-label={`Swap ${i + 1} URL`} value={row.url} onChange={(e) => update(i, { url: e.target.value })} className="input flex-1" placeholder="https://example.com/black-friday" />
            <button type="button" aria-label={`Remove swap ${i + 1}`} onClick={() => setRows((r) => r.filter((_, idx) => idx !== i))} className="rounded-xl bg-slate-800 px-3 text-slate-300 hover:bg-slate-700">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={rows.length >= MAX_DESTINATION_STEPS}
          onClick={() => setRows((r) => [...r, { local: '', url: '' }])}
          className="inline-flex items-center gap-1 rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50"
        >
          <Plus className="h-3 w-3" /> Add swap
        </button>
        <button onClick={() => void save()} disabled={saving} className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save Schedule'}
        </button>
      </div>
    </section>
  )
}
