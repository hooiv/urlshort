/**
 * Pure validation/sanitization for bio-block URLs.
 *
 * Link blocks previously sent every keystroke to the API with no validation,
 * so half-typed values (`https://`, `htt`) were persisted and later rendered
 * as dead links in the public preview. The builder now sanitizes before
 * persisting and skips the network write while the URL is invalid, keeping
 * the local draft so typing is never interrupted.
 */

export const MAX_BLOCK_URL_LENGTH = 2048;

/** Trim and strip control characters (pasted newlines/tabs) from a URL. */
export function sanitizeBlockUrl(raw: string): string {
  // biome-ignore lint: strip ASCII control chars that can never be part of a URL.
  return raw.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, MAX_BLOCK_URL_LENGTH);
}

/**
 * User-facing error for a link-block URL, or null when it may be persisted.
 * An empty value is allowed (draft block without a destination yet).
 */
export function getBlockUrlError(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const url = sanitizeBlockUrl(raw);
  if (!url) return null;
  if (raw.trim().length > MAX_BLOCK_URL_LENGTH) {
    return `URL must be ${MAX_BLOCK_URL_LENGTH} characters or fewer`;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return 'Link URL must start with http:// or https://';
    }
  } catch {
    return 'Enter a valid URL, e.g. https://example.com';
  }
  return null;
}
