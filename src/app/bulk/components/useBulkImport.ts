import { useCallback, useMemo, useState } from 'react';
import {
  parseBulkPreview,
  summarizeBulkImport,
  validateBulkCsv,
  type BulkPreview,
  type ImportedBulkLink,
} from './bulkCsv';

export type BulkPhase = 'idle' | 'uploading' | 'done';

/**
 * Owns bulk-import state: pasted CSV, upload progress, and results.
 *
 * Fixes vs the previous inline implementation: CSV is validated client-side
 * (empty / oversized / over-row-cap / missing-column fail fast with the
 * server's messages), and partial failures are tracked — the API silently
 * skips invalid rows, so the hook derives `skippedCount` from submitted vs
 * created rows instead of reporting unqualified success.
 */
export function useBulkImport() {
  const [csvText, setCsvText] = useState('');
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<BulkPhase>('idle');
  const [importedLinks, setImportedLinks] = useState<ImportedBulkLink[]>([]);
  const [submittedRows, setSubmittedRows] = useState(0);

  const preview: BulkPreview = useMemo(() => parseBulkPreview(csvText), [csvText]);
  const validPreviewCount = useMemo(() => preview.rows.filter((r) => r.isValid).length, [preview]);
  const skippedCount = useMemo(
    () => summarizeBulkImport(submittedRows, importedLinks.length).skipped,
    [submittedRows, importedLinks]
  );

  const runImport = useCallback(async (): Promise<{ created: number; skipped: number } | null> => {
    const validation = validateBulkCsv(csvText);
    if (validation.error) return Promise.reject(new Error(validation.error));
    setBusy(true);
    setPhase('uploading');
    try {
      const response = await fetch('/api/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: csvText }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string'
            ? data.error
            : 'Import failed';
        throw new Error(message);
      }
      const links =
        typeof data === 'object' && data !== null && 'links' in data && Array.isArray(data.links)
          ? (data.links as ImportedBulkLink[])
          : [];
      setImportedLinks(links);
      setSubmittedRows(validation.totalRows);
      setPhase('done');
      return summarizeBulkImport(validation.totalRows, links.length);
    } finally {
      setBusy(false);
    }
  }, [csvText]);

  const resetResults = useCallback(() => {
    setImportedLinks([]);
    setSubmittedRows(0);
    setPhase('idle');
  }, []);

  return {
    csvText,
    setCsvText,
    busy,
    phase,
    preview,
    validPreviewCount,
    importedLinks,
    submittedRows,
    skippedCount,
    runImport,
    resetResults,
  };
}
