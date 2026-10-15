'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { useWritableFolders } from '@/components/FolderPicker'
import { buildBulkEditChanges, emptyBulkEditForm, type BulkEditForm } from '@/app/account/components/bulk-edit-form'

/** Sticky action bar for the links the user ticked. Sends one atomic PATCH /api/bulk/edit. */
export default function BulkEditBar({
  selected,
  shortCodes = [],
  workspaceId,
  sameWorkspace,
  onClear,
  onDone,
}: {
  selected: string[]
  /** Short codes of the selected links, used for the QR ZIP download (max 100). */
  shortCodes?: string[]
  workspaceId: string | null
  /** False when the selection mixes workspaces: folder moves are then unavailable. */
  sameWorkspace: boolean
  onClear: () => void
  onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<BulkEditForm>(emptyBulkEditForm)
  const folders = useWritableFolders(open && sameWorkspace ? workspaceId : null)
  const [qrBusy, setQrBusy] = useState(false)

  async function downloadQrZip(format: 'png' | 'svg') {
    if (shortCodes.length > 100) return toast.error('Select at most 100 links for a QR archive')
    setQrBusy(true)
    try {
      const response = await fetch('/api/links/qr-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codes: shortCodes, format, track: true }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.error || 'QR download failed')
      }
      const skipped = response.headers.get('X-QR-Skipped')
      const url = URL.createObjectURL(await response.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = `quicklink-qr-${format}.zip`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(skipped ? `Downloaded (skipped: ${skipped})` : `Downloaded ${shortCodes.length} QR codes`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'QR download failed')
    } finally {
      setQrBusy(false)
    }
  }
  const set = (patch: Partial<BulkEditForm>) => setForm((f) => ({ ...f, ...patch }))

  async function apply(dryRun = false) {
    const built = buildBulkEditChanges(form)
    if ('error' in built) return toast.error(built.error)
    setBusy(true)
    try {
      const response = await fetch('/api/bulk/edit', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ links: selected, changes: built.changes, ...(dryRun ? { dryRun: true } : {}) }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        const first = data?.failures?.[0]
        throw new Error(first ? `${data.error}: /${first.link} — ${first.reason}` : data?.error || 'Bulk edit failed')
      }
      if (dryRun) {
        toast.success(`Preview: ${data.wouldUpdate} would change, ${data.unchanged} already match. Nothing was saved.`)
        return
      }
      toast.success(`${data.updated} updated${data.unchanged ? `, ${data.unchanged} already matched` : ''}`)
      setForm(emptyBulkEditForm)
      setOpen(false)
      onClear()
      onDone()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Bulk edit failed')
    } finally {
      setBusy(false)
    }
  }

  if (!selected.length) return null
  return (
    <div className="sticky bottom-4 z-20 mt-4 rounded-xl border border-blue-500/40 bg-slate-950/95 p-3 shadow-xl backdrop-blur" role="region" aria-label="Bulk edit">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-medium text-blue-300">{selected.length} selected</span>
        <button onClick={() => setOpen((v) => !v)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-slate-200 hover:border-slate-500">
          {open ? 'Hide options' : 'Edit selected'}
        </button>
        <button disabled={qrBusy || !shortCodes.length} onClick={() => downloadQrZip('png')} className="rounded-lg border border-slate-700 px-3 py-1.5 text-slate-200 hover:border-slate-500 disabled:opacity-50">
          {qrBusy ? 'Preparing…' : 'QR ZIP (PNG)'}
        </button>
        <button disabled={qrBusy || !shortCodes.length} onClick={() => downloadQrZip('svg')} className="rounded-lg border border-slate-700 px-3 py-1.5 text-slate-200 hover:border-slate-500 disabled:opacity-50">
          QR ZIP (SVG)
        </button>
        <button onClick={onClear} className="ml-auto text-slate-400 hover:text-slate-200">Clear</button>
      </div>
      {open && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs text-slate-400">Add tags
            <input className="input mt-1 w-full" value={form.addTags} onChange={(e) => set({ addTags: e.target.value })} placeholder="launch, q4" />
          </label>
          <label className="text-xs text-slate-400">Remove tags
            <input className="input mt-1 w-full" value={form.removeTags} onChange={(e) => set({ removeTags: e.target.value })} />
          </label>
          <label className="text-xs text-slate-400">Folder
            <select className="input mt-1 w-full" value={form.folder} disabled={!sameWorkspace || !workspaceId} onChange={(e) => set({ folder: e.target.value })}>
              <option value="">Leave as is</option>
              <option value="none">No folder</option>
              {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-400">Expiry
            <div className="mt-1 flex gap-2">
              <input type="date" className="input w-full" value={form.expiry === 'clear' ? '' : form.expiry} onChange={(e) => set({ expiry: e.target.value })} />
              <button type="button" className="whitespace-nowrap rounded-lg border border-slate-700 px-2 text-slate-300" onClick={() => set({ expiry: 'clear' })}>
                {form.expiry === 'clear' ? 'Will clear' : 'Clear'}
              </button>
            </div>
          </label>
          <label className="text-xs text-slate-400">Extend expiry (days)
            <input type="number" min={1} max={3650} className="input mt-1 w-full" placeholder="e.g. 30" value={form.extendDays} onChange={(e) => set({ extendDays: e.target.value })} />
          </label>
          <label className="text-xs text-slate-400">Status
            <select className="input mt-1 w-full" value={form.state} onChange={(e) => set({ state: e.target.value as BulkEditForm['state'] })}>
              <option value="">Leave as is</option>
              <option value="archive">Archive (pause)</option>
              <option value="trash">Move to trash (restorable)</option>
              <option value="restore">Restore</option>
            </select>
          </label>
          <label className="text-xs text-slate-400">Pin to top
            <select className="input mt-1 w-full" value={form.pin} onChange={(e) => set({ pin: e.target.value as BulkEditForm['pin'] })}>
              <option value="">Leave as is</option>
              <option value="pin">Pin</option>
              <option value="unpin">Unpin</option>
            </select>
          </label>
          <label className="text-xs text-slate-400">Redirect type
            <select className="input mt-1 w-full" value={form.redirect} onChange={(e) => set({ redirect: e.target.value as BulkEditForm['redirect'] })}>
              <option value="">Leave as is</option>
              <option value="default">307 temporary (default)</option>
              <option value="302">302 found</option>
              <option value="301">301 permanent</option>
              <option value="308">308 permanent</option>
            </select>
          </label>
          <label className="text-xs text-slate-400">Password
            <div className="mt-1 flex gap-2">
              <input type="password" autoComplete="new-password" className="input w-full" placeholder="Set one password" value={form.password === 'remove' ? '' : form.password} onChange={(e) => set({ password: e.target.value })} />
              <button type="button" className="whitespace-nowrap rounded-lg border border-slate-700 px-2 text-slate-300" onClick={() => set({ password: form.password === 'remove' ? '' : 'remove' })}>
                {form.password === 'remove' ? 'Will remove' : 'Remove'}
              </button>
            </div>
          </label>
          <label className="text-xs text-slate-400">Click limit
            <div className="mt-1 flex gap-2">
              <input type="number" min={1} className="input w-full" placeholder="Total clicks" value={form.maxClicks === 'clear' ? '' : form.maxClicks} onChange={(e) => set({ maxClicks: e.target.value })} />
              <button type="button" className="whitespace-nowrap rounded-lg border border-slate-700 px-2 text-slate-300" onClick={() => set({ maxClicks: form.maxClicks === 'clear' ? '' : 'clear' })}>{form.maxClicks === 'clear' ? 'Will clear' : 'Clear'}</button>
            </div>
          </label>
          <label className="text-xs text-slate-400">Daily click cap
            <div className="mt-1 flex gap-2">
              <input type="number" min={1} className="input w-full" placeholder="Clicks per day" value={form.dailyCap === 'clear' ? '' : form.dailyCap} onChange={(e) => set({ dailyCap: e.target.value })} />
              <button type="button" className="whitespace-nowrap rounded-lg border border-slate-700 px-2 text-slate-300" onClick={() => set({ dailyCap: form.dailyCap === 'clear' ? '' : 'clear' })}>{form.dailyCap === 'clear' ? 'Will clear' : 'Clear'}</button>
            </div>
          </label>
          <label className="text-xs text-slate-400">Fallback URL (expired / limit hit)
            <div className="mt-1 flex gap-2">
              <input type="url" className="input w-full" placeholder="https://…" value={form.expiredUrl === 'clear' ? '' : form.expiredUrl} onChange={(e) => set({ expiredUrl: e.target.value })} />
              <button type="button" className="whitespace-nowrap rounded-lg border border-slate-700 px-2 text-slate-300" onClick={() => set({ expiredUrl: form.expiredUrl === 'clear' ? '' : 'clear' })}>{form.expiredUrl === 'clear' ? 'Will clear' : 'Clear'}</button>
            </div>
          </label>
          <label className="text-xs text-slate-400">Internal note
            <div className="mt-1 flex gap-2">
              <input className="input w-full" value={form.notes === 'clear' ? '' : form.notes} onChange={(e) => set({ notes: e.target.value })} />
              <button type="button" className="whitespace-nowrap rounded-lg border border-slate-700 px-2 text-slate-300" onClick={() => set({ notes: form.notes === 'clear' ? '' : 'clear' })}>{form.notes === 'clear' ? 'Will clear' : 'Clear'}</button>
            </div>
          </label>
          <label className="text-xs text-slate-400">Link cloaking
            <select className="input mt-1 w-full" value={form.cloak} onChange={(e) => set({ cloak: e.target.value as BulkEditForm['cloak'] })}>
              <option value="">Leave as is</option>
              <option value="on">Cloak</option>
              <option value="off">Uncloak</option>
            </select>
          </label>
          <div className="grid grid-cols-3 gap-2 text-xs text-slate-400">
            <label>utm_source<input className="input mt-1 w-full" value={form.utmSource} onChange={(e) => set({ utmSource: e.target.value })} /></label>
            <label>utm_medium<input className="input mt-1 w-full" value={form.utmMedium} onChange={(e) => set({ utmMedium: e.target.value })} /></label>
            <label>utm_campaign<input className="input mt-1 w-full" value={form.utmCampaign} onChange={(e) => set({ utmCampaign: e.target.value })} /></label>
          </div>
          <div className="grid grid-cols-[7rem_1fr_1fr] gap-2 text-xs text-slate-400 sm:col-span-2 lg:col-span-3">
            <label>Rewrite destinations
              <select className="input mt-1 w-full" value={form.rewriteMode} onChange={(e) => set({ rewriteMode: e.target.value as BulkEditForm['rewriteMode'] })}>
                <option value="">Off</option>
                <option value="host">Swap hostname</option>
                <option value="prefix">Swap path prefix</option>
                <option value="text">Find and replace</option>
              </select>
            </label>
            <label>Find<input disabled={!form.rewriteMode} className="input mt-1 w-full" placeholder={form.rewriteMode === 'host' ? 'old.example.com' : form.rewriteMode === 'prefix' ? '/blog' : 'text'} value={form.rewriteFrom} onChange={(e) => set({ rewriteFrom: e.target.value })} /></label>
            <label>Replace with<input disabled={!form.rewriteMode} className="input mt-1 w-full" placeholder={form.rewriteMode === 'host' ? 'new.example.com' : form.rewriteMode === 'prefix' ? '/articles' : ''} value={form.rewriteTo} onChange={(e) => set({ rewriteTo: e.target.value })} /></label>
          </div>
          <div className="sm:col-span-2 lg:col-span-3 flex items-center gap-3">
            <button disabled={busy} onClick={() => apply(true)} className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 disabled:opacity-50">Preview</button>
            <button disabled={busy} onClick={() => apply()} className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {busy ? 'Applying…' : `Apply to ${selected.length} link${selected.length === 1 ? '' : 's'}`}
            </button>
            <p className="text-xs text-slate-500">All-or-nothing: if any link can’t be changed, none are. UTM values never overwrite ones a link already has.</p>
          </div>
        </div>
      )}
    </div>
  )
}
