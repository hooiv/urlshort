'use client'

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { ShieldBan } from 'lucide-react'
import Field from '@/app/manage/[shortCode]/components/Field'
import { parseVisitorBlock } from '@/lib/visitor-block'

/** Splits free text (newlines, commas, spaces) into trimmed tokens. */
export function splitEntries(text: string): string[] {
  return text.split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean)
}

export default function VisitorBlockSection({ shortCode, token }: { shortCode: string; token: string }) {
  const endpoint = `/api/links/${encodeURIComponent(shortCode)}`
  const [ips, setIps] = useState('')
  const [hosts, setHosts] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(endpoint, { headers: { 'x-management-token': token } })
        const link = await res.json()
        if (cancelled || !res.ok || !link.visitorBlock) return
        setIps((link.visitorBlock.cidrs ?? []).join('\n'))
        setHosts((link.visitorBlock.referrerHosts ?? []).join('\n'))
      } catch {
        /* the campaign controls surface load errors */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [endpoint, token])

  const save = useCallback(async () => {
    const cidrs = splitEntries(ips)
    const referrerHosts = splitEntries(hosts)
    const payload = cidrs.length || referrerHosts.length ? { cidrs, referrerHosts } : null
    const parsed = parseVisitorBlock(payload)
    if (!parsed.ok) return void toast.error(parsed.error)
    setSaving(true)
    try {
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-management-token': token },
        body: JSON.stringify({ visitorBlock: payload }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Could not save blocklist')
      toast.success(payload ? 'Blocklist saved' : 'Blocklist cleared')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }, [endpoint, hosts, ips, token])

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <div className="flex items-center gap-2">
        <ShieldBan className="h-4 w-4 text-rose-400" />
        <h2 className="font-semibold text-white">Visitor Blocklist</h2>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        Block abusive IPs or ranges and hotlinking referrer sites. Blocked visitors are not counted.
      </p>
      <div className="mt-4 space-y-4">
        <Field label="IPs or CIDR ranges (IPv4/IPv6, one per line)">
          <textarea value={ips} onChange={(e) => setIps(e.target.value)} rows={3} className="input" placeholder="203.0.113.0/24" />
        </Field>
        <Field label="Referrer domains (subdomains included; *.example.com also works)">
          <textarea value={hosts} onChange={(e) => setHosts(e.target.value)} rows={3} className="input" placeholder="scraper.example" />
        </Field>
      </div>
      <button
        onClick={() => void save()}
        disabled={saving}
        className="mt-4 rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save Blocklist'}
      </button>
    </section>
  )
}
