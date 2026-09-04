'use client'

import { useState } from 'react'
import { Copy } from 'lucide-react'
import toast from 'react-hot-toast'
import CardAction from '@/app/account/components/CardAction'
import Field from '@/app/account/components/Field'
import type { Url } from '@/app/account/components/types'
import {
  parseTagsInput,
  safeDestinationHref,
  validateLinkEdit,
} from '@/app/account/components/account-utils'

export default function LinkCard({
  link,
  onChanged,
  onSelectTag,
}: {
  link: Url
  onChanged: () => void
  onSelectTag?: (tag: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const [title, setTitle] = useState(link.title || '')
  const [destination, setDestination] = useState(link.originalUrl)
  const [tagsInput, setTagsInput] = useState((link.tags ?? []).join(', '))

  async function patch(body: Record<string, unknown>, successMessage: string) {
    setBusy(true)
    try {
      const response = await fetch(`/api/links/${encodeURIComponent(link.shortCode)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Update failed')
      toast.success(successMessage)
      setEditing(false)
      onChanged()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  function saveEdit() {
    const error = validateLinkEdit({ title, destination, tagsInput })
    if (error) return toast.error(error)
    void patch(
      {
        title: title.trim() || null,
        destinationUrl: destination.trim(),
        tags: parseTagsInput(tagsInput),
      },
      'Link updated',
    )
  }

  async function remove() {
    if (typeof window === 'undefined') return
    if (!window.confirm(`Delete /${link.shortCode}? The short code stops working immediately. Analytics history is kept.`))
      return
    setBusy(true)
    try {
      const response = await fetch(`/api/links/${encodeURIComponent(link.shortCode)}`, { method: 'DELETE' })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Delete failed')
      toast.success('Link deleted')
      onChanged()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  async function copyShortUrl() {
    try {
      if (typeof window === 'undefined' || !navigator.clipboard) throw new Error('unavailable')
      await navigator.clipboard.writeText(`${window.location.origin}/${link.shortCode}`)
      toast.success('Copied')
    } catch {
      toast.error('Clipboard access failed')
    }
  }

  const statusBadge = !link.isActive ? (
    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">paused</span>
  ) : link.riskStatus === 'review' ? (
    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300">in review</span>
  ) : null

  return (
    <article className="rounded-xl border border-slate-800 bg-slate-950 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{link.title || `/${link.shortCode}`}</span>
            {statusBadge}
          </div>
          <button
            onClick={() => void copyShortUrl()}
            className="mt-2 flex max-w-full items-center gap-2 truncate font-mono text-xs text-blue-300 hover:text-blue-200"
            title="Copy short URL"
          >
            /{link.shortCode}
            <Copy className="h-3 w-3 shrink-0" />
          </button>
          <a
            href={safeDestinationHref(link.originalUrl)}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block truncate text-xs text-slate-600 hover:text-slate-400"
          >
            {link.originalUrl}
          </a>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-semibold">{link.clicks.toLocaleString()}</div>
          <div className="text-[10px] text-slate-600">clicks</div>
        </div>
      </div>

      {editing && (
        <div className="mt-4 space-y-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
          <Field label="Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className="input"
              placeholder="Internal label"
            />
          </Field>
          <Field label="Fallback destination">
            <input
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              type="url"
              className="input"
            />
          </Field>
          <Field label="Tags (comma-separated, max 10)">
            <input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              className="input"
              placeholder="summer, paid-ads"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setEditing(false)
                setTitle(link.title || '')
                setDestination(link.originalUrl)
                setTagsInput((link.tags ?? []).join(', '))
              }}
              className="rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              disabled={busy}
              onClick={saveEdit}
              className="rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-semibold hover:bg-blue-400 disabled:opacity-60"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {showQr && (
        <div className="mt-4 flex items-center gap-4 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
          {/* eslint-disable @next/next/no-img-element -- API-served QR image */}
          <img
            src={`/api/links/${encodeURIComponent(link.shortCode)}/qr?size=256`}
            alt={`QR code for /${link.shortCode}`}
            width={96}
            height={96}
            className="rounded-lg bg-white p-1.5"
          />
          {/* eslint-enable @next/next/no-img-element */}
          <div>
            <p className="text-xs text-slate-400">Scan to open</p>
            <a
              href={`/api/links/${encodeURIComponent(link.shortCode)}/qr?size=1024`}
              download={`quicklink-${link.shortCode}-qr.png`}
              className="mt-2 inline-flex rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium hover:border-slate-500"
            >
              Download PNG
            </a>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(link.tags ?? []).map((tag) => (
            <button
              key={tag}
              onClick={() => onSelectTag?.(tag)}
              className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-300 hover:bg-violet-500/25"
            >
              {tag}
            </button>
          ))}
          <span className="text-[10px] text-slate-600">
            {new Date(link.createdAt).toLocaleDateString()} · {link._count?.rules ?? 0} rules
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          <CardAction onClick={() => setShowQr((value) => !value)} label={showQr ? 'Hide QR' : 'QR'} />
          <CardAction onClick={() => setEditing((value) => !value)} label="Edit" />
          <CardAction
            disabled={busy}
            onClick={() => void patch({ isActive: !link.isActive }, link.isActive ? 'Link paused' : 'Link activated')}
            label={link.isActive ? 'Pause' : 'Activate'}
          />
          <a
            href={`/analytics/${link.shortCode}`}
            className="rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-800 hover:text-white"
          >
            Analytics
          </a>
          <a
            href={`/manage/${link.shortCode}`}
            className="rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-800 hover:text-white"
          >
            Manage
          </a>
          <CardAction disabled={busy} onClick={() => void remove()} label="Delete" danger />
        </div>
      </div>
    </article>
  )
}
