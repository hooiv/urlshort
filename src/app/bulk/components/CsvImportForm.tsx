'use client';

import { useRef } from 'react';
import { Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatNumber } from '@/lib/format';
import { MAX_BULK_CSV_BYTES, type BulkPreview } from './bulkCsv';

const MAX_FILE_BYTES = MAX_BULK_CSV_BYTES;

export function CsvImportForm({
  csvText,
  onCsvChange,
  busy,
  uploading,
  preview,
  validPreviewCount,
  onImport,
}: {
  csvText: string;
  onCsvChange: (text: string) => void;
  busy: boolean;
  uploading: boolean;
  preview: BulkPreview;
  validPreviewCount: number;
  onImport: () => Promise<{ created: number; skipped: number } | null>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset so re-selecting the same file fires onChange again.
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      toast.error('File exceeds the 1MB upload limit');
      return;
    }
    const text = await file.text();
    onCsvChange(text);
    toast.success(`Loaded ${file.name}`);
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!csvText.trim()) {
      toast.error('CSV data is empty');
      return;
    }
    try {
      const summary = await onImport();
      if (!summary) return;
      if (summary.skipped > 0) {
        toast.success(
          `Provisioned ${formatNumber(summary.created)} of ${formatNumber(summary.created + summary.skipped)} links — ${formatNumber(summary.skipped)} rows skipped`
        );
      } else {
        toast.success(`Successfully provisioned ${formatNumber(summary.created)} smart links!`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
    }
  }

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">Import CSV Data</h2>

        <label className="inline-flex items-center gap-1.5 rounded-xl border border-blue-500/30 bg-blue-500/10 px-3.5 py-1.5 text-xs font-semibold text-blue-300 hover:bg-blue-500/20 cursor-pointer transition">
          <Upload className="h-3.5 w-3.5" /> Upload File (.csv)
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>
      </div>

      <form onSubmit={handleImport} className="space-y-4">
        <textarea
          rows={8}
          value={csvText}
          onChange={(e) => onCsvChange(e.target.value)}
          placeholder="Paste raw CSV content here..."
          className="w-full rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs text-slate-200 outline-none focus:border-blue-500 resize-none"
        />

        {preview.headerError && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2">
            {preview.headerError}
          </p>
        )}

        {preview.rows.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Preview ({formatNumber(preview.rows.length)} sample rows
              {preview.totalRows > preview.rows.length
                ? ` of ${formatNumber(preview.totalRows)}`
                : ''}
              {' · '}
              {formatNumber(validPreviewCount)} valid)
            </div>
            <div className="divide-y divide-slate-800/80 rounded-xl border border-slate-800 bg-slate-950">
              {preview.rows.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-3 text-xs">
                  <span className="font-mono text-slate-300 truncate max-w-xs" title={r.error ?? r.url}>
                    {r.url || '(missing URL)'}
                  </span>
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

        {uploading && (
          <div className="space-y-2" role="status" aria-live="polite">
            <div className="text-xs font-semibold uppercase tracking-wider text-blue-300">
              Provisioning {formatNumber(preview.totalRows)} rows…
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-blue-500" />
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
  );
}
