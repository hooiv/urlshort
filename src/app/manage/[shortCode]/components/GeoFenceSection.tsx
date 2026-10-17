'use client'

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Globe } from 'lucide-react'
import Field from '@/app/manage/[shortCode]/components/Field'
import { parseGeoFence, type GeoFenceMode } from '@/lib/geo-fence'

/** Splits free text ("us, de  fr") into trimmed upper-case tokens. */
export function splitCountries(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean)
}

export default function GeoFenceSection({ shortCode, token }: { shortCode: string; token: string }) {
  const endpoint = `/api/links/${encodeURIComponent(shortCode)}`
  const [enabled, setEnabled] = useState(false)
  const [mode, setMode] = useState<GeoFenceMode>('deny')
  const [countries, setCountries] = useState('')
  const [allowUnknown, setAllowUnknown] = useState<'default' | 'yes' | 'no'>('default')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(endpoint, { headers: { 'x-management-token': token } })
        const link = await res.json()
        if (cancelled || !res.ok || !link.geoFence) return
        setEnabled(true)
        setMode(link.geoFence.mode === 'allow' ? 'allow' : 'deny')
        setCountries((link.geoFence.countries ?? []).join(', '))
        if (typeof link.geoFence.allowUnknown === 'boolean') setAllowUnknown(link.geoFence.allowUnknown ? 'yes' : 'no')
      } catch {
        /* the campaign controls surface load errors */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [endpoint, token])

  const save = useCallback(async () => {
    let payload: Record<string, unknown> | null = null
    if (enabled) {
      payload = { mode, countries: splitCountries(countries) }
      if (allowUnknown !== 'default') payload.allowUnknown = allowUnknown === 'yes'
      const parsed = parseGeoFence(payload)
      if (!parsed.ok) return void toast.error(parsed.error)
    }
    setSaving(true)
    try {
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-management-token': token },
        body: JSON.stringify({ geoFence: payload }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Could not save country rules')
      toast.success(enabled ? 'Country rules saved' : 'Country rules removed')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }, [allowUnknown, countries, enabled, endpoint, mode, token])

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <div className="flex items-center gap-2">
        <Globe className="h-4 w-4 text-emerald-400" />
        <h2 className="font-semibold text-white">Country Restrictions</h2>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        Allow only, or block, visitors by country. Blocked visitors see a region-unavailable page.
      </p>
      <label className="mt-4 flex items-center gap-2 text-xs text-slate-300">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Restrict this link by country
      </label>
      {enabled && (
        <div className="mt-4 space-y-4">
          <Field label="Rule">
            <select value={mode} onChange={(e) => setMode(e.target.value as GeoFenceMode)} className="input">
              <option value="deny">Block these countries</option>
              <option value="allow">Allow only these countries</option>
            </select>
          </Field>
          <Field label="Countries (ISO codes, comma separated, e.g. US, DE, IN)">
            <input value={countries} onChange={(e) => setCountries(e.target.value)} className="input" placeholder="US, DE" />
          </Field>
          <Field label="Visitors with unknown country">
            <select value={allowUnknown} onChange={(e) => setAllowUnknown(e.target.value as 'default' | 'yes' | 'no')} className="input">
              <option value="default">Default (allowed when blocking, denied when allow-listing)</option>
              <option value="yes">Always allow</option>
              <option value="no">Always block</option>
            </select>
          </Field>
        </div>
      )}
      <button
        onClick={() => void save()}
        disabled={saving}
        className="mt-4 rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save Country Rules'}
      </button>
    </section>
  )
}
