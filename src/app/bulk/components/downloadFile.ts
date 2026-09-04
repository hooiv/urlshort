/**
 * DOM file-download helper shared by the bulk page actions.
 *
 * Fixes vs the previous inline copies: the anchor is attached to the
 * document before clicking (required by some browsers), and the object URL
 * is revoked on the next tick instead of synchronously, which previously
 * could invalidate the download before it started.
 */
export function downloadTextFile(filename: string, content: string, mime = 'text/csv;charset=utf-8;'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
