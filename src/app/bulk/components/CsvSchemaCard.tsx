'use client';

import { BULK_SAMPLE_CSV } from './bulkCsv';

export function CsvSchemaCard() {
  return (
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
        {BULK_SAMPLE_CSV}
      </pre>
    </section>
  );
}
