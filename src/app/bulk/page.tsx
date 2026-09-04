'use client'

import Link from 'next/link'
import {
  ArrowLeft,
  Download,
  FileSpreadsheet,
} from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'
import { BULK_SAMPLE_CSV } from './components/bulkCsv'
import { CsvImportForm } from './components/CsvImportForm'
import { CsvSchemaCard } from './components/CsvSchemaCard'
import { BulkResults } from './components/BulkResults'
import { downloadTextFile } from './components/downloadFile'
import { useBulkImport } from './components/useBulkImport'

export default function BulkPage() {
  const {
    csvText,
    setCsvText,
    busy,
    phase,
    preview,
    validPreviewCount,
    importedLinks,
    skippedCount,
    runImport,
  } = useBulkImport()

  function downloadSampleCsv() {
    downloadTextFile('quicklink-bulk-template.csv', BULK_SAMPLE_CSV)
    toast.success('Sample CSV template downloaded')
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
        <CsvSchemaCard />

        {/* Upload & Paste Form */}
        <CsvImportForm
          csvText={csvText}
          onCsvChange={setCsvText}
          busy={busy}
          uploading={phase === 'uploading'}
          preview={preview}
          validPreviewCount={validPreviewCount}
          onImport={runImport}
        />

        {/* Results List */}
        <BulkResults links={importedLinks} skippedCount={skippedCount} />
      </main>
    </div>
  )
}
