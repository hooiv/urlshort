/**
 * Clipboard helper with a legacy fallback.
 *
 * `navigator.clipboard` rejects on non-secure contexts and older browsers,
 * and the previous page ignored the promise entirely. This orchestrator is
 * dependency-injected so the fallback chain is unit-testable in node; the
 * component wires the real DOM implementations at the call site.
 */

export interface ClipboardDeps {
  /** Primary path — e.g. `() => navigator.clipboard.writeText(text)`. */
  writeClipboard?: (text: string) => Promise<void>
  /** Legacy path — e.g. hidden-textarea + `document.execCommand('copy')`. */
  legacyCopy?: (text: string) => boolean | Promise<boolean>
}

/** Copy text, falling back to the legacy path. Resolves `true` on success. */
export async function copyTextWithFallback(text: string, deps: ClipboardDeps = {}): Promise<boolean> {
  if (deps.writeClipboard) {
    try {
      await deps.writeClipboard(text)
      return true
    } catch {
      // Fall through to the legacy path below.
    }
  }
  if (deps.legacyCopy) {
    try {
      return Boolean(await deps.legacyCopy(text))
    } catch {
      return false
    }
  }
  return false
}

/**
 * Legacy in-page copy for contexts without the async Clipboard API.
 * Must run in the component (needs `document`); isolated here so the
 * orchestration above stays DOM-free and testable.
 */
export function legacyTextareaCopy(text: string): boolean {
  if (typeof document === 'undefined') return false
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  document.body.removeChild(textarea)
  return ok
}
