import { useCallback, useMemo, useState } from 'react';
import {
  parseBulkPreview,
  summarizeBulkImport,
  validateBulkCsv,
  type BulkPreview,
  type ImportedBulkLink,
  type ImportResult,
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
  const [results, setResults] = useState<ImportResult[]>([]);
  const [onConflict, setOnConflict] = useState<'skip' | 'generate'>('skip');
  const [workspaceId, setWorkspaceId] = useState('');
  const [folderId, setFolderId] = useState('');

  const preview: BulkPreview = useMemo(() => parseBulkPreview(csvText), [csvText]);
  const validPreviewCount = useMemo(() => preview.rows.filter((r) => r.isValid).length, [preview]);
  const skippedCount = useMemo(
    () => summarizeBulkImport(submittedRows, importedLinks.length).skipped,
    [submittedRows, importedLinks]
  );

  /** POSTs an import and records the outcome. `submitted` falls back to the server's row count (provider pulls). */
  const submit = useCallback(async (source: Record<string, unknown>, submitted?: number): Promise<{ created: number; skipped: number; truncated: boolean }> => {
    setBusy(true);
    setPhase('uploading');
    try {
      const response = await fetch('/api/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...source, onConflict, ...(workspaceId ? { workspaceId } : {}), ...(workspaceId && folderId ? { folderId } : {}) }),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: unknown;
        links?: unknown;
        results?: unknown;
        summary?: { total?: number; truncated?: boolean };
      } | null;
      if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Import failed');
      const links = Array.isArray(data?.links) ? (data.links as ImportedBulkLink[]) : [];
      const rowResults = Array.isArray(data?.results) ? (data.results as ImportResult[]) : [];
      const total = submitted ?? (typeof data?.summary?.total === 'number' ? data.summary.total : rowResults.length);
      setImportedLinks(links);
      setResults(rowResults);
      setSubmittedRows(total);
      setPhase('done');
      return { ...summarizeBulkImport(total, links.length), truncated: data?.summary?.truncated === true };
    } catch (error) {
      setPhase('idle');
      throw error;
    } finally {
      setBusy(false);
    }
  }, [onConflict, workspaceId, folderId]);

  const runImport = useCallback(async (): Promise<{ created: number; skipped: number } | null> => {
    const validation = validateBulkCsv(csvText);
    if (validation.error) return Promise.reject(new Error(validation.error));
    return submit({ csv: csvText }, validation.totalRows);
  }, [csvText, submit]);

  const runProviderImport = useCallback(
    (name: 'bitly' | 'shortio' | 'rebrandly', token: string, scope: string) =>
      submit({ provider: { name, token, ...(scope.trim() ? { scope: scope.trim() } : {}) } }),
    [submit],
  );

  const resetResults = useCallback(() => {
    setImportedLinks([]);
    setResults([]);
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
    results,
    onConflict,
    setOnConflict,
    workspaceId,
    setWorkspaceId: (id: string) => { setWorkspaceId(id); setFolderId(''); },
    folderId,
    setFolderId,
    runImport,
    runProviderImport,
    resetResults,
  };
}
