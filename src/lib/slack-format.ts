/**
 * Slack incoming-webhook support. A webhook endpoint whose URL is a Slack
 * incoming-webhook is delivered as a Slack Block Kit message instead of the
 * signed JSON envelope (Slack rejects unknown top-level shapes and ignores
 * custom headers, so no signature is sent). No OAuth app is needed: the
 * workspace admin pastes the hooks.slack.com URL.
 */

const SLACK_HOOK_PATH = /^\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]{16,}$/

export function isSlackWebhookUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' && u.hostname === 'hooks.slack.com' && !u.port && !u.username && !u.password && SLACK_HOOK_PATH.test(u.pathname)
  } catch {
    return false
  }
}

/** Slack mrkdwn control characters must be escaped in user-controlled text. */
export function escapeSlack(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function str(v: unknown, max = 200): string {
  const s = typeof v === 'string' ? v : v == null ? '' : String(v)
  return escapeSlack(s.length > max ? `${s.slice(0, max - 1)}…` : s)
}

export function formatMoney(cents: unknown, currency: unknown): string {
  const n = typeof cents === 'number' && Number.isFinite(cents) ? cents : 0
  const cur = typeof currency === 'string' && /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : 'USD'
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).format(n / 100)
  } catch {
    return `${(n / 100).toFixed(2)} ${cur}`
  }
}

export type SlackMessage = { text: string; blocks: unknown[] }

function message(headline: string, fields: [string, string][], context?: string): SlackMessage {
  const blocks: unknown[] = [{ type: 'section', text: { type: 'mrkdwn', text: headline } }]
  const shown = fields.filter(([, v]) => v).slice(0, 10)
  if (shown.length) blocks.push({ type: 'section', fields: shown.map(([k, v]) => ({ type: 'mrkdwn', text: `*${k}*\n${v}` })) })
  if (context) blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: context }] })
  // `text` is the notification fallback; strip mrkdwn emphasis for it.
  return { text: headline.replace(/[*_`]/g, ''), blocks }
}

/** Builds the Slack message for a QuickLink event; unknown events get a generic notice. */
export function buildSlackMessage(event: string, payload: Record<string, unknown>): SlackMessage {
  const code = str(payload.shortCode)
  const when = typeof payload.occurredAt === 'string' ? str(payload.occurredAt, 40) : typeof payload.timestamp === 'string' ? str(payload.timestamp, 40) : ''
  const context = when ? `QuickLink · ${when}` : 'QuickLink'
  switch (event) {
    case 'link.created':
      return message(`:link: *New link created* \`${code}\``, [['Destination', str(payload.destinationUrl, 300)]], context)
    case 'link.updated':
      return message(`:pencil2: *Link updated* \`${code}\``, [['Destination', str(payload.destinationUrl, 300)]], context)
    case 'link.clicked':
      return message(`:eyes: *Link clicked* \`${code}\``, [
        ['Country', str(payload.country, 60)],
        ['Device', str(payload.device, 60)],
        ['Referrer', str(payload.referrer, 120)],
      ], context)
    case 'conversion.recorded':
      return message(`:moneybag: *Sale recorded* ${formatMoney(payload.valueCents, payload.currency)}`, [
        ['Source', str(payload.source, 40)],
        ['Goal', str(payload.goalEventKey ?? payload.goalId, 80)],
      ], context)
    case 'conversion.refunded':
      return message(`:leftwards_arrow_with_hook: *Sale refunded* ${formatMoney(payload.refundedCents, payload.currency)}`, [
        ['Net value', formatMoney(payload.netValueCents, payload.currency)],
        ['Source', str(payload.source, 40)],
      ], context)
    case 'diagnostic.test':
      return message(':white_check_mark: *QuickLink is connected to this channel*', [], context)
    case 'endpoint.disabled':
      return message(':warning: *A webhook was disabled after repeated failures*', [['Reason', str(payload.reason, 300)]], context)
    default:
      return message(`:bell: *${str(event, 60)}*`, [], context)
  }
}

/** Parses a stored delivery body and renders it for Slack. */
export function slackBodyForDelivery(event: string, storedPayload: string): string {
  let parsed: unknown
  try { parsed = JSON.parse(storedPayload) } catch { parsed = {} }
  const record = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  return JSON.stringify(buildSlackMessage(event, record))
}
