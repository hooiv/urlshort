/**
 * API catalog for the developer docs playground.
 *
 * Pure data + grouping helpers. Every entry mirrors an actual route handler
 * under `src/app/api` — verify paths/methods there before adding endpoints.
 */

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

export type LangTab = 'curl' | 'node' | 'python' | 'go'

export const LANG_TABS: LangTab[] = ['curl', 'node', 'python', 'go']

/** Which credential an endpoint accepts. Defaults to `'apiKey'`. */
export type EndpointAuth = 'apiKey' | 'managementToken'

export interface EndpointSpec {
  id: string
  group: string
  method: HttpMethod
  path: string
  title: string
  description: string
  /** Overrides the default `x-api-key` auth (e.g. the health probe). */
  auth?: EndpointAuth
  /** Rendered as a callout when the endpoint needs non-standard auth. */
  authNote?: string
  pathParams?: Array<{ name: string; placeholder: string; default: string }>
  queryParams?: Array<{ name: string; placeholder: string; default?: string }>
  defaultBody?: Record<string, unknown>
}

export const API_CATALOG: EndpointSpec[] = [
  // Links
  {
    id: 'shorten-create',
    group: 'Core Links',
    method: 'POST',
    path: '/api/shorten',
    title: 'Create Smart Short Link',
    description: 'Generates a new shortened link with optional custom alias, title, description, and tags.',
    defaultBody: {
      url: 'https://example.com/product-launch',
      customCode: 'launch-2026',
      title: 'Summer Product Launch',
      tags: ['marketing', 'launch'],
    },
  },
  {
    id: 'shorten-list',
    group: 'Core Links',
    method: 'GET',
    path: '/api/shorten',
    title: 'List Accessible Links',
    description: 'Retrieves keyset-paginated links with search and tag filtering support.',
    queryParams: [
      { name: 'search', placeholder: 'e.g. launch', default: '' },
      { name: 'tag', placeholder: 'e.g. marketing', default: '' },
      { name: 'take', placeholder: '20', default: '20' },
    ],
  },
  {
    id: 'link-detail',
    group: 'Core Links',
    method: 'GET',
    path: '/api/links/{shortCode}',
    title: 'Get Link Metadata',
    description: 'Fetches detailed configuration, click metrics, health status, and safety assessment.',
    pathParams: [{ name: 'shortCode', placeholder: 'abc1234', default: 'demo' }],
  },
  {
    id: 'link-update',
    group: 'Core Links',
    method: 'PATCH',
    path: '/api/links/{shortCode}',
    title: 'Update Link Settings',
    description: 'Modifies destination URL, password protection, retargeting pixels, or link expiration.',
    pathParams: [{ name: 'shortCode', placeholder: 'abc1234', default: 'demo' }],
    defaultBody: {
      title: 'Updated Campaign Title',
      tags: ['marketing', 'v2'],
    },
  },
  {
    id: 'link-delete',
    group: 'Core Links',
    method: 'DELETE',
    path: '/api/links/{shortCode}',
    title: 'Delete Short Link',
    description: 'Permanently deletes a short link and its associated analytics via cascading deletes.',
    pathParams: [{ name: 'shortCode', placeholder: 'abc1234', default: 'demo' }],
  },

  // Routing & Experiments
  {
    id: 'rules-create',
    group: 'Smart Routing & A/B Tests',
    method: 'POST',
    path: '/api/links/{shortCode}/rules',
    title: 'Create Routing Rule / Variant',
    description: 'Creates a geo, device, referrer, or weighted split-test destination variant.',
    pathParams: [{ name: 'shortCode', placeholder: 'abc1234', default: 'demo' }],
    defaultBody: {
      name: 'iOS Mobile App Store',
      destinationUrl: 'https://apps.apple.com/app/id123456789',
      priority: 100,
      weight: 100,
      deviceType: 'mobile',
      countryCodes: 'US,GB,CA',
    },
  },
  {
    id: 'promote-variant',
    group: 'Smart Routing & A/B Tests',
    method: 'POST',
    path: '/api/links/{shortCode}/promote',
    title: 'Promote Winning Variant',
    description: 'Promotes an experimental routing variant into the permanent primary fallback destination.',
    pathParams: [{ name: 'shortCode', placeholder: 'abc1234', default: 'demo' }],
    defaultBody: {
      ruleId: 'cuid_rule_sample_id',
    },
  },
  {
    id: 'revisions-create',
    group: 'Smart Routing & A/B Tests',
    method: 'POST',
    path: '/api/links/{shortCode}/revisions',
    title: 'Publish Destination Release',
    description: 'Appends a versioned release revision for seamless zero-downtime destination updates.',
    pathParams: [{ name: 'shortCode', placeholder: 'abc1234', default: 'demo' }],
    defaultBody: {
      destinationUrl: 'https://example.com/v2-campaign',
      reason: 'Q3 Promotional Update',
    },
  },

  // Analytics & QR
  {
    id: 'analytics-get',
    group: 'Analytics & Attribution',
    method: 'GET',
    path: '/api/analytics/{shortCode}',
    title: 'Get Multi-Dimensional Analytics',
    description: 'Retrieves time-series clicks, conversions, geo breakdowns, OS/browser splits, and Bayesian A/B test results.',
    pathParams: [{ name: 'shortCode', placeholder: 'abc1234', default: 'demo' }],
    queryParams: [
      { name: 'range', placeholder: '7d', default: '7d' },
      { name: 'country', placeholder: 'US', default: '' },
      { name: 'device', placeholder: 'mobile', default: '' },
    ],
  },
  {
    id: 'qr-generate',
    group: 'Analytics & Attribution',
    method: 'GET',
    path: '/api/links/{shortCode}/qr',
    title: 'Generate Custom Vector QR Code',
    description: 'Renders high-res 4K PNG or SVG QR codes with custom color schemes and center logo badges.',
    pathParams: [{ name: 'shortCode', placeholder: 'abc1234', default: 'demo' }],
    queryParams: [
      { name: 'format', placeholder: 'png | svg', default: 'svg' },
      { name: 'size', placeholder: '512', default: '512' },
      { name: 'dark', placeholder: '#0f172a', default: '#0f172a' },
      { name: 'light', placeholder: '#ffffff', default: '#ffffff' },
      { name: 'icon', placeholder: 'link | twitter | github', default: 'link' },
    ],
  },
  {
    id: 'webhook-test',
    group: 'Diagnostics & Webhooks',
    method: 'POST',
    path: '/api/links/{shortCode}/webhook-test',
    title: 'Dispatch Test Webhook',
    description: 'Sends a signed HMAC-SHA256 test click event payload to verify customer webhook endpoints.',
    pathParams: [{ name: 'shortCode', placeholder: 'abc1234', default: 'demo' }],
    defaultBody: {
      webhookUrl: 'https://webhook.site/sample-uuid',
    },
  },
  {
    id: 'health-probe',
    group: 'Diagnostics & Webhooks',
    method: 'POST',
    path: '/api/links/{shortCode}/health',
    title: 'Trigger Health Probe',
    description: 'Executes on-demand HTTP health check probe against fallback destination and rule variants.',
    auth: 'managementToken',
    authNote:
      'This probe authenticates with the per-link management token via the x-management-token (or Bearer) header — an x-api-key is not accepted. Paste the management token into the key field above.',
    pathParams: [{ name: 'shortCode', placeholder: 'abc1234', default: 'demo' }],
    defaultBody: {
      target: 'fallback',
    },
  },
]

export const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  POST: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  PATCH: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  DELETE: 'bg-red-500/10 text-red-400 border-red-500/30',
}

/** Group the catalog for the sidebar, preserving declaration order. */
export function groupCatalog(catalog: EndpointSpec[]): Array<[string, EndpointSpec[]]> {
  const map = new Map<string, EndpointSpec[]>()
  catalog.forEach((item) => {
    const list = map.get(item.group) || []
    list.push(item)
    map.set(item.group, list)
  })
  return Array.from(map.entries())
}

/** True when the method carries a JSON payload. */
export function methodHasBody(method: HttpMethod): boolean {
  return method === 'POST' || method === 'PATCH'
}
