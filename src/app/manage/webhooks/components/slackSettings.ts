import { isSlackWebhookUrl } from '@/lib/slack-format';

export const SLACK_EVENT_OPTIONS = [
  { id: 'link.created', label: 'New link created' },
  { id: 'link.updated', label: 'Link updated' },
  { id: 'link.clicked', label: 'Every click (noisy)' },
  { id: 'conversion.recorded', label: 'Sale recorded' },
  { id: 'conversion.refunded', label: 'Sale refunded' },
] as const;

export const DEFAULT_SLACK_EVENTS = ['link.created', 'conversion.recorded', 'conversion.refunded'];

/** The path of a Slack hook is a bearer secret, so never render it in full. */
export function maskSlackUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const parts = u.pathname.split('/').filter(Boolean);
    if (u.hostname !== 'hooks.slack.com' || parts.length < 4) return raw;
    return `${u.hostname}/services/${parts[1]}/${parts[2]}/••••${parts[3].slice(-4)}`;
  } catch {
    return raw;
  }
}

export function getSlackUrlError(raw: string): string | null {
  const url = raw.trim();
  if (!url) return 'Paste your Slack incoming webhook URL';
  return isSlackWebhookUrl(url) ? null : 'Use a Slack URL like https://hooks.slack.com/services/T…/B…/…';
}

export function toggleEvent(current: string[], event: string): string[] {
  return current.includes(event) ? current.filter((e) => e !== event) : [...current, event];
}

export function describeTestResult(r: { success?: boolean; statusCode?: number | null; responseSnippet?: string | null }): string {
  if (r.success) return 'Test message delivered to Slack';
  const detail = r.responseSnippet?.trim();
  return `Slack rejected the test${r.statusCode ? ` (HTTP ${r.statusCode})` : ''}${detail ? `: ${detail.slice(0, 120)}` : ''}`;
}
