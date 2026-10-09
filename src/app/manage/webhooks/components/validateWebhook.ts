/**
 * Pure validation for webhook endpoint URLs.
 *
 * The API only accepts HTTPS URLs (SSRF guard) from a closed event
 * allowlist. The old form sent `['click', 'conversion']` — values outside
 * the allowlist that the server silently rewrote to `link.clicked` — and
 * showed no error when the server rejected the URL. Both are fixed here.
 */

export const MAX_WEBHOOK_URL_LENGTH = 2048;

/**
 * Default subscription, mapped onto the server's event allowlist
 * (`link.clicked`, `link.created`, `link.updated`, `conversion.recorded`, `conversion.refunded`,
 * `diagnostic.test`). Preserves the old form's "click + conversion" intent
 * with values the server actually stores.
 */
export const DEFAULT_WEBHOOK_EVENTS = ['link.clicked', 'conversion.recorded'];

/** User-facing error for an endpoint URL, or null when it may be submitted. */
export function getWebhookUrlError(raw: string): string | null {
  const url = raw.trim();
  if (!url) return 'URL is required';
  if (url.length > MAX_WEBHOOK_URL_LENGTH) {
    return `URL must be ${MAX_WEBHOOK_URL_LENGTH} characters or fewer`;
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'Enter a valid URL, e.g. https://api.yourdomain.com/webhooks/quicklink';
  }
  if (parsed.protocol !== 'https:') {
    return 'Webhook URLs must use HTTPS';
  }
  if (!parsed.hostname) return 'Enter a valid URL with a hostname';
  return null;
}

/** Splits a comma/whitespace/newline separated list typed by the user. */
export function parseFilterList(input: string): string[] {
  return [...new Set(input.split(/[\s,]+/).map((part) => part.trim()).filter(Boolean))];
}

export function describeLinkScope(filter: { linkScope: string; tags: string[]; shortCodes: string[]; folderIds?: string[]; workspaceName?: string | null }): string {
  const owner = filter.workspaceName ? `${filter.workspaceName}: ` : '';
  return owner + describeFilter(filter);
}

function describeFilter(filter: { linkScope: string; tags: string[]; shortCodes: string[]; folderIds?: string[] }): string {
  if (filter.linkScope === 'folders') {
    const n = filter.folderIds?.length ?? 0;
    return `Links in ${n} folder${n === 1 ? '' : 's'}`;
  }
  if (filter.linkScope === 'tags') return `Links tagged ${filter.tags.join(', ')}`;
  if (filter.linkScope === 'links') {
    const shown = filter.shortCodes.slice(0, 3).map((code) => `/${code}`).join(', ');
    return filter.shortCodes.length > 3 ? `${shown} +${filter.shortCodes.length - 3} more` : shown;
  }
  return 'All links';
}
