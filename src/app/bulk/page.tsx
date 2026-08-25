'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Copy,
  Download,
  FileSpreadsheet,
  Upload,
} from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'

interface ImportedLink {
  originalUrl: string
  shortCode: string
  title?: string | null
  tags?: string[]
}

const SAMPLE_CSV = `originalUrl,title,customAlias,tags
https://example.com/summer-sale,Summer Promotion,summer-sale-2026,"promo, summer"
https://example.com/mobile-app,Mobile App Download,app-download,"mobile, app"
https://example.com/webinar,Product Webinar,webinar-q3,"webinar, product"`

export default function BulkPage() {
  const [csvText, setCsvText] = useState('')
  const [busy, setBusy] = useState(false)
  const [importedLinks, setImportedLinks] = useState<ImportedLink[]>([])

  // Parse CSV preview rows
  const previewRows = useMemo(() => {
    if (!csvText.trim()) return []
    const lines = csvText.trim().split('\n')
    if (lines.length <= 1) return []
    const rows = lines.slice(1, 10).map((line, idx) => {
      const parts = line.split(',')
      const url = parts[0]?.trim() || ''
      const isValid = /^https?:\/\/.+/i.test(url)
      return { id: idx, url, title: parts[1]?.trim(), alias: parts[2]?.trim(), isValid }
    })
    return rows
  }, [csvText])

  function downloadSampleCsv() {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'quicklink-bulk-template.csv'
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Sample CSV template downloaded')
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    setCsvText(text)
    toast.success(`Loaded ${file.name}`)
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault()
    if (!csvText.trim()) return toast.error('CSV data is empty')
    setBusy(true)
    try {
      const response = await fetch('/api/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: csvText }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Import failed')
      setImportedLinks(data.links || [])
      toast.success(`Successfully provisioned ${data.links.length} smart links!`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  function exportImportedCsv() {
    if (!importedLinks.length) return
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://quicklink.to'
    const headers = 'originalUrl,shortCode,shortUrl\n'
    const rows = importedLinks
      .map((l) => `"${l.originalUrl}","${l.shortCode}","${origin}/${l.shortCode}"`)
      .join('\n')
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'quicklink-imported-results.csv'
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Imported results CSV exported')
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20">
      <Toaster position="top-right" />

      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur sticky top-0 z-30">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link
              href="/account"
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-900 hover:text-white"
              title="Return to Account"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-blue-400" />
              <span className="font-semibold text-white">Bulk Link Provisioning Studio</span>
            </div>
          </div>

          <button
            onClick={downloadSampleCsv}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:text-white"
          >
            <Download className="h-3.5 w-3.5" /> Sample CSV
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8 space-y-8">
        {/* CSV Format Helper */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-white">Supported CSV Schema</h2>
            <p className="text-xs text-slate-400 mt-1">
              Include a header row. Columns: <code className="text-blue-300">originalUrl</code> (required),{' '}
              <code className="text-blue-300">title</code>, <code className="text-blue-300">customAlias</code>,{' '}
              <code className="text-blue-300">tags</code>.
            </p>
          </div>

          <pre className="rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs text-slate-300 overflow-x-auto">
            {SAMPLE_CSV}
          </pre>
        </section>

        {/* Upload & Paste Form */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">Import CSV Data</h2>

            <label className="inline-flex items-center gap-1.5 rounded-xl border border-blue-500/30 bg-blue-500/10 px-3.5 py-1.5 text-xs font-semibold text-blue-300 hover:bg-blue-500/20 cursor-pointer transition">
              <Upload className="h-3.5 w-3.5" /> Upload File (.csv)
              <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>

          <form onSubmit={handleImport} className="space-y-4">
            <textarea
              rows={8}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder="Paste raw CSV content here..."
              className="w-full rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs text-slate-200 outline-none focus:border-blue-500 resize-none"
            />

            {/* Validation Preview */}
            {previewRows.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Preview ({previewRows.length} sample rows)
                </div>
                <div className="divide-y divide-slate-800/80 rounded-xl border border-slate-800 bg-slate-950">
                  {previewRows.map((r) => (
                    <div key={r.id} className="flex items-center justify-between p-3 text-xs">
                      <span className="font-mono text-slate-300 truncate max-w-xs">{r.url}</span>
                      <div className="flex items-center gap-2">
                        {r.alias && <span className="font-mono text-slate-500">/{r.alias}</span>}
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                            r.isValid ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                          }`}
                        >
                          {r.isValid ? 'Valid URL' : 'Invalid Syntax'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              disabled={busy || !csvText.trim()}
              className="flex items-center justify-center gap-2 w-full rounded-xl bg-blue-500 py-3.5 text-xs font-semibold text-white hover:bg-blue-400 disabled:opacity-60 transition shadow-lg shadow-blue-500/20"
            >
              <Upload className="h-4 w-4" />
              {busy ? 'Provisioning Infrastructure…' : 'Execute Bulk Link Creation'}
            </button>
          </form>
        </section>

        {/* Results List */}
        {importedLinks.length > 0 && (
          <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-white text-base">Provisioning Completed</h2>
                <p className="text-xs text-emerald-200/80 mt-0.5">
                  {importedLinks.length} links provisioned and ready for routing.
                </p>
              </div>

              <button
                onClick={exportImportedCsv}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-400 transition"
              >
                <Download className="h-3.5 w-3.5" /> Export Results CSV
              </button>
            </div>

            <div className="divide-y divide-slate-800/80 rounded-xl border border-slate-800 bg-slate-950">
              {importedLinks.map((l, i) => (
                <div key={i} className="flex items-center justify-between p-3.5 text-xs">
                  <span className="font-mono text-slate-300 truncate max-w-md">{l.originalUrl}</span>
                  <div className="flex items-center gap-3">
                    <a
                      href={`/${l.shortCode}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-blue-300 font-semibold hover:underline"
                    >
                      /{l.shortCode}
                    </a>
                    <button
                      onClick={() => {
                        const full = typeof window !== 'undefined' ? `${window.location.origin}/${l.shortCode}` : `/${l.shortCode}`
                        void navigator.clipboard.writeText(full)
                        toast.success('Copied link')
                      }}
                      className="text-slate-500 hover:text-white"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
