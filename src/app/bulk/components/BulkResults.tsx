'use client';

import { Copy, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatNumber } from '@/lib/format';
import { buildResultsCsv, type ImportedBulkLink } from './bulkCsv';
import { downloadTextFile } from './downloadFile';

async function copyShortLink(shortCode: string) {
  const full = typeof window !== 'undefined' ? `${window.location.origin}/${shortCode}` : `/${shortCode}`;
  try {
    await navigator.clipboard.writeText(full);
    toast.success('Copied link');
  } catch {
    toast.error('Copy failed — select and copy the link manually');
  }
}

export function BulkResults({
  links,
  skippedCount,
}: {
  links: ImportedBulkLink[];
  skippedCount: number;
}) {
  if (links.length === 0) return null;

  function exportImportedCsv() {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://quicklink.to';
    downloadTextFile('quicklink-imported-results.csv', buildResultsCsv(links, origin));
    toast.success('Imported results CSV exported');
  }

  return (
    <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 space-y-4 animate-in fade-in duration-200">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-white text-base">Provisioning Completed</h2>
          <p className="text-xs text-emerald-200/80 mt-0.5">
            {formatNumber(links.length)} links provisioned and ready for routing.
          </p>
          {skippedCount > 0 && (
            <p className="text-xs text-amber-200/90 mt-1">
              {formatNumber(skippedCount)} rows were skipped (invalid URLs or duplicates) — only valid
              rows were provisioned.
            </p>
          )}
        </div>

        <button
          onClick={exportImportedCsv}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-400 transition"
        >
          <Download className="h-3.5 w-3.5" /> Export Results CSV
        </button>
      </div>

      <div className="divide-y divide-slate-800/80 rounded-xl border border-slate-800 bg-slate-950">
        {links.map((l) => (
          <div key={l.shortCode} className="flex items-center justify-between p-3.5 text-xs">
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
              <button onClick={() => void copyShortLink(l.shortCode)} className="text-slate-500 hover:text-white">
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
