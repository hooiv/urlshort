/**
 * OpenAPI 3.1 description of the public REST API, served at /api/openapi.json.
 * Operations are declared once in OPERATIONS; a test asserts every documented
 * path maps to a real route file and every method is exported by it, so the
 * spec cannot silently drift from the code.
 */
export type HttpMethod = 'get' | 'post' | 'patch' | 'put' | 'delete'

export type OperationDef = {
  path: string
  method: HttpMethod
  summary: string
  tag: string
  /** API-key scopes accepted (any one suffices). Empty = session only. */
  scopes: string[]
  /** Query parameters. */
  query?: { name: string; description: string; required?: boolean }[]
  body?: Record<string, { type: string; description: string; required?: boolean }>
}

const LINK_READ = ['links:read', 'links:write']
const ANALYTICS = ['analytics:read', 'links:read', 'links:write']

export const OPERATIONS: OperationDef[] = [
  { path: '/api/links/{shortCode}/experiment', method: 'get', summary: 'A/B experiment results: per-variant clicks, conversions, lift and significance', tag: 'Analytics', scopes: ANALYTICS, query: [{ name: 'days', description: 'Window in days, 1-365 (default 30)' }, { name: 'confidence', description: 'Confidence level 0.8-0.999 (default 0.95)' }, { name: 'goalId', description: 'Conversion goal to measure' }, { name: 'control', description: 'Rule id used as the control variant' }] },
  { path: '/api/links/{shortCode}/promote', method: 'post', summary: 'Promote the winning variant to the link destination', tag: 'Links', scopes: ['links:write'] },
  { path: '/api/links/{shortCode}/import-clicks', method: 'post', summary: 'Import historical click data from a provider', tag: 'Links', scopes: ['links:write'] },
  { path: '/api/links/{shortCode}/webhook-test', method: 'post', summary: 'Send a test event to the link webhooks', tag: 'Links', scopes: ['links:write'] },
  { path: '/api/links/{shortCode}/qr/render', method: 'post', summary: 'Render a branded QR code (logo upload supported)', tag: 'Links', scopes: LINK_READ },
  { path: '/api/links/{shortCode}/domain-settings', method: 'get', summary: 'Get per-link domain settings', tag: 'Links', scopes: LINK_READ },
  { path: '/api/links/{shortCode}/domain-settings', method: 'patch', summary: 'Update per-link domain settings', tag: 'Links', scopes: ['links:write'] },
  { path: '/api/analytics/{shortCode}/funnel', method: 'get', summary: 'Click-to-conversion funnel for a link', tag: 'Analytics', scopes: ANALYTICS },
  { path: '/api/analytics/{shortCode}/insights', method: 'get', summary: 'Automated insights for a link', tag: 'Analytics', scopes: ANALYTICS },
  { path: '/api/workspaces/{workspaceId}/folders/{folderId}', method: 'patch', summary: 'Update a folder', tag: 'Workspaces', scopes: ['links:write'] },
  { path: '/api/workspaces/{workspaceId}/folders/{folderId}', method: 'delete', summary: 'Delete a folder', tag: 'Workspaces', scopes: ['links:write'] },
  { path: '/api/workspaces/{workspaceId}/utm-templates/{templateId}', method: 'patch', summary: 'Update a UTM template', tag: 'Workspaces', scopes: ['links:write'] },
  { path: '/api/workspaces/{workspaceId}/utm-templates/{templateId}', method: 'delete', summary: 'Delete a UTM template', tag: 'Workspaces', scopes: ['links:write'] },
  { path: '/api/links/{shortCode}/activity', method: 'get', summary: 'Link activity timeline', tag: 'Links', scopes: LINK_READ },
  { path: '/api/links/{shortCode}/click-target', method: 'get', summary: 'Get the click-target override', tag: 'Links', scopes: LINK_READ },
  { path: '/api/links/{shortCode}/click-target', method: 'put', summary: 'Set the click-target override', tag: 'Links', scopes: ['links:write'] },
  { path: '/api/links/{shortCode}/click-target', method: 'delete', summary: 'Remove the click-target override', tag: 'Links', scopes: ['links:write'] },
  { path: '/api/links/{shortCode}/export', method: 'get', summary: 'Export one link with its rules and goals', tag: 'Links', scopes: LINK_READ },
  { path: '/api/links/{shortCode}/goals/{goalId}', method: 'patch', summary: 'Update a conversion goal', tag: 'Links', scopes: ['links:write'] },
  { path: '/api/links/{shortCode}/goals/{goalId}', method: 'delete', summary: 'Delete a conversion goal', tag: 'Links', scopes: ['links:write'] },
  { path: '/api/links/{shortCode}/health', method: 'get', summary: 'Destination health status', tag: 'Links', scopes: LINK_READ },
  { path: '/api/links/{shortCode}/health', method: 'post', summary: 'Run a destination health check now', tag: 'Links', scopes: ['links:write'] },
  { path: '/api/links/{shortCode}/health', method: 'patch', summary: 'Update health-check settings', tag: 'Links', scopes: ['links:write'] },
  { path: '/api/links/{shortCode}/restore', method: 'post', summary: 'Restore a trashed link', tag: 'Links', scopes: ['links:write'] },
  { path: '/api/links/{shortCode}/revert', method: 'post', summary: 'Revert a link to a previous revision', tag: 'Links', scopes: ['links:write'] },
  { path: '/api/links/{shortCode}/revisions', method: 'get', summary: 'List link revisions', tag: 'Links', scopes: LINK_READ },
  { path: '/api/links/{shortCode}/revisions', method: 'post', summary: 'Save a named revision', tag: 'Links', scopes: ['links:write'] },
  { path: '/api/links/{shortCode}/revisions/{revisionId}', method: 'delete', summary: 'Delete a revision', tag: 'Links', scopes: ['links:write'] },
  { path: '/api/links/{shortCode}/routing/conflicts', method: 'get', summary: 'Detect overlapping routing rules', tag: 'Routing', scopes: LINK_READ },
  { path: '/api/links/{shortCode}/routing/preview', method: 'post', summary: 'Preview which rule a visitor would hit', tag: 'Routing', scopes: LINK_READ },
  { path: '/api/links/{shortCode}/rules', method: 'get', summary: 'List routing rules', tag: 'Routing', scopes: LINK_READ },
  { path: '/api/links/{shortCode}/rules', method: 'post', summary: 'Create a routing rule', tag: 'Routing', scopes: ['links:write'] },
  { path: '/api/links/{shortCode}/rules/{ruleId}', method: 'patch', summary: 'Update a routing rule', tag: 'Routing', scopes: ['links:write'] },
  { path: '/api/links/{shortCode}/rules/{ruleId}', method: 'delete', summary: 'Delete a routing rule', tag: 'Routing', scopes: ['links:write'] },
  { path: '/api/links/{shortCode}/safety', method: 'get', summary: 'Link safety assessment', tag: 'Links', scopes: LINK_READ },
  { path: '/api/links/{shortCode}/safety', method: 'patch', summary: 'Update link safety overrides', tag: 'Links', scopes: ['links:write'] },
  { path: '/api/links/{shortCode}/verify', method: 'post', summary: 'Verify destination ownership', tag: 'Links', scopes: ['links:write'] },
  { path: '/api/links/{shortCode}/qr', method: 'get', summary: 'Render a QR code for a link', tag: 'Links', scopes: LINK_READ },
  { path: '/api/links/{shortCode}/public-stats', method: 'get', summary: 'Get public stats share status', tag: 'Analytics', scopes: LINK_READ },
  { path: '/api/links/{shortCode}/public-stats', method: 'post', summary: 'Enable public stats sharing', tag: 'Analytics', scopes: ['links:write'] },
  { path: '/api/links/{shortCode}/public-stats', method: 'delete', summary: 'Disable public stats sharing', tag: 'Analytics', scopes: ['links:write'] },
  { path: '/api/commissions', method: 'post', summary: 'Approve, pay or void commissions (idempotent)', tag: 'Rewards', scopes: ['links:write'] },
  { path: '/api/rewards/config', method: 'get', summary: 'List reward rules (account default and per-link overrides)', tag: 'Rewards', scopes: LINK_READ },
  { path: '/api/rewards/config', method: 'put', summary: 'Replace the reward rules for one scope', tag: 'Rewards', scopes: ['links:write'] },
  { path: '/api/rewards/config', method: 'delete', summary: 'Remove a reward rule override', tag: 'Rewards', scopes: ['links:write'] },
  { path: '/api/bulk', method: 'post', summary: 'Bulk create or import links', tag: 'Links', scopes: ['links:write'] },
  { path: '/api/commissions', method: 'get', summary: 'List reward commissions', tag: 'Rewards', scopes: LINK_READ },
  { path: '/api/commissions/export', method: 'get', summary: 'Export commissions as CSV', tag: 'Rewards', scopes: LINK_READ },
  { path: '/api/commissions/statement', method: 'get', summary: 'Partner payout statement', tag: 'Rewards', scopes: LINK_READ },
  { path: '/api/links/{shortCode}/domains', method: 'get', summary: 'List domains attached to a link', tag: 'Domains', scopes: ['links:write'] },
  { path: '/api/links/{shortCode}/domains', method: 'post', summary: 'Attach a domain to a link', tag: 'Domains', scopes: ['links:write'] },
  { path: '/api/links/{shortCode}/domains', method: 'patch', summary: 'Update the domain on a link', tag: 'Domains', scopes: ['links:write'] },
  { path: '/api/links/{shortCode}/domains', method: 'delete', summary: 'Detach a domain from a link', tag: 'Domains', scopes: ['links:write'] },
  { path: '/api/links/{shortCode}/folder', method: 'patch', summary: 'Move a link to a folder', tag: 'Links', scopes: ['links:write'] },
  { path: '/api/links/{shortCode}/goals', method: 'get', summary: 'List conversion goals for a link', tag: 'Links', scopes: ['links:write'] },
  { path: '/api/links/{shortCode}/goals', method: 'post', summary: 'Create a conversion goal', tag: 'Links', scopes: ['links:write'] },
  { path: '/api/links/bulk-clone', method: 'post', summary: 'Clone several links at once', tag: 'Links', scopes: ['links:write'] },
  { path: '/api/links/preflight', method: 'post', summary: 'Check a destination URL before creating a link', tag: 'Links', scopes: LINK_READ },
  { path: '/api/rewards/preview', method: 'post', summary: 'Preview a reward calculation', tag: 'Rewards', scopes: LINK_READ },
  { path: '/api/tags/rename', method: 'post', summary: 'Rename or merge a tag', tag: 'Tags', scopes: ['links:write'] },
  { path: '/api/tags/suggest', method: 'get', summary: 'Suggest tags for a destination', tag: 'Tags', scopes: LINK_READ },
  { path: '/api/views/{id}', method: 'delete', summary: 'Delete a saved view', tag: 'Views', scopes: ['links:write'] },
  { path: '/api/webhooks/{id}', method: 'patch', summary: 'Update a webhook', tag: 'Webhooks', scopes: ['webhooks:write'] },
  { path: '/api/webhooks/{id}', method: 'delete', summary: 'Delete a webhook', tag: 'Webhooks', scopes: ['webhooks:write'] },
  { path: '/api/webhooks/{id}/deliveries', method: 'get', summary: 'List webhook deliveries', tag: 'Webhooks', scopes: ['webhooks:write'] },
  { path: '/api/webhooks/{id}/deliveries/{deliveryId}', method: 'get', summary: 'Get one webhook delivery', tag: 'Webhooks', scopes: ['webhooks:write'] },
  { path: '/api/webhooks/{id}/deliveries/{deliveryId}/replay', method: 'post', summary: 'Replay a delivery', tag: 'Webhooks', scopes: ['webhooks:write'] },
  { path: '/api/webhooks/{id}/deliveries/replay-failed', method: 'post', summary: 'Replay all failed deliveries', tag: 'Webhooks', scopes: ['webhooks:write'] },
  { path: '/api/webhooks/{id}/test', method: 'post', summary: 'Send a test event', tag: 'Webhooks', scopes: ['webhooks:write'] },
  { path: '/api/webhooks/{id}/rotate-secret', method: 'post', summary: 'Rotate the signing secret with a dual-signature grace window', tag: 'Webhooks', scopes: ['webhooks:write'] },
  { path: '/api/zapier/hooks', method: 'post', summary: 'Subscribe a Zapier REST hook', tag: 'Zapier', scopes: ['webhooks:write'] },
  { path: '/api/zapier/hooks/{id}', method: 'delete', summary: 'Unsubscribe a Zapier REST hook', tag: 'Zapier', scopes: ['webhooks:write'] },
  { path: '/api/zapier/me', method: 'get', summary: 'Zapier connection test', tag: 'Zapier', scopes: LINK_READ },
  {
    path: '/api/shorten', method: 'post', summary: 'Create a short link', tag: 'Links', scopes: ['links:write'],
    body: {
      url: { type: 'string', description: 'Destination URL (http or https).', required: true },
      customCode: { type: 'string', description: 'Custom slug.' },
      title: { type: 'string', description: 'Internal title.' },
      tags: { type: 'array', description: 'Tag names.' },
      expiresAt: { type: 'string', description: 'ISO 8601 expiry.' },
    },
  },
  { path: '/api/shorten', method: 'get', summary: 'List your links', tag: 'Links', scopes: LINK_READ },
  { path: '/api/links/{shortCode}', method: 'get', summary: 'Get one link', tag: 'Links', scopes: LINK_READ },
  { path: '/api/links/{shortCode}', method: 'patch', summary: 'Update a link', tag: 'Links', scopes: ['links:write'] },
  { path: '/api/links/{shortCode}', method: 'delete', summary: 'Move a link to trash', tag: 'Links', scopes: ['links:write'] },
  {
    path: '/api/links/export', method: 'get', summary: 'Export links as CSV or JSON', tag: 'Links', scopes: LINK_READ,
    query: [{ name: 'format', description: 'csv or json' }],
  },
  {
    path: '/api/bulk/edit', method: 'patch', summary: 'Edit many links in one transaction', tag: 'Links', scopes: ['links:write'],
    body: { shortCodes: { type: 'array', description: 'Links to edit.', required: true }, changes: { type: 'object', description: 'Fields to change.', required: true } },
  },
  {
    path: '/api/bulk/edit/undo', method: 'post', summary: 'Undo a bulk edit from its audit event', tag: 'Links', scopes: ['links:write'],
    body: { auditEventId: { type: 'string', description: 'Audit event id returned by the bulk edit.', required: true }, dryRun: { type: 'boolean', description: 'Preview the revert without applying it.' } },
  },
  {
    path: '/api/experiments/sample-size', method: 'get', summary: 'Clicks an experiment needs for a trustworthy verdict', tag: 'Analytics', scopes: ANALYTICS,
    query: [
      { name: 'baselineRate', description: 'Current conversion rate, 0 to 1.', required: true },
      { name: 'minRelativeLift', description: 'Smallest relative lift worth detecting.' },
      { name: 'perVariantClicks', description: 'Instead of a lift: return the minimum detectable lift for this many clicks per variant.' },
      { name: 'confidence', description: 'Confidence level.' }, { name: 'power', description: 'Statistical power.' },
      { name: 'variants', description: 'Number of variants.' }, { name: 'dailyClicks', description: 'Traffic per day, to estimate duration.' },
    ],
  },
  { path: '/api/views', method: 'get', summary: 'List saved link views', tag: 'Views', scopes: LINK_READ },
  { path: '/api/views', method: 'post', summary: 'Create or update a saved view', tag: 'Views', scopes: ['links:write'] },
  {
    path: '/api/zapier/triggers/{trigger}', method: 'get', summary: 'Zapier polling trigger sample and feed', tag: 'Zapier', scopes: ANALYTICS,
  },
  { path: '/api/tags', method: 'get', summary: 'List tags with usage counts', tag: 'Tags', scopes: LINK_READ },
  { path: '/api/tags', method: 'delete', summary: 'Delete a tag from all links', tag: 'Tags', scopes: ['links:write'] },
  {
    path: '/api/analytics/{shortCode}', method: 'get', summary: 'Analytics for one link', tag: 'Analytics', scopes: ANALYTICS,
    query: [{ name: 'days', description: 'Window length in days.' }],
  },
  {
    path: '/api/analytics/trending', method: 'get', summary: 'Links gaining the most clicks', tag: 'Analytics', scopes: ANALYTICS,
    query: [{ name: 'workspaceId', description: 'Scope to a workspace.' }],
  },
  {
    path: '/api/analytics/stale', method: 'get', summary: 'Active links with no recent clicks', tag: 'Analytics', scopes: ANALYTICS,
    query: [{ name: 'days', description: '30, 60, 90, 180 or 365.' }, { name: 'limit', description: '1 to 200.' }],
  },
  { path: '/api/links/{shortCode}/clone', method: 'post', summary: 'Clone a link with a fresh short code', tag: 'Links', scopes: ['links:write'] },
  {
    path: '/api/links/{shortCode}/rename', method: 'post', summary: 'Change a link short code', tag: 'Links', scopes: ['links:write'],
    body: { newShortCode: { type: 'string', description: 'New short code.', required: true }, confirm: { type: 'boolean', description: 'Must be true; the old URL stops working.', required: true } },
  },
  { path: '/api/analytics/{shortCode}/channels', method: 'get', summary: 'Traffic channels for a link', tag: 'Analytics', scopes: ANALYTICS, query: [{ name: 'days', description: 'Window in days.' }] },
  { path: '/api/analytics/{shortCode}/clicks', method: 'get', summary: 'Raw click events for a link', tag: 'Analytics', scopes: ANALYTICS },
  { path: '/api/analytics/{shortCode}/compare', method: 'get', summary: 'Period-over-period comparison for a link', tag: 'Analytics', scopes: ANALYTICS, query: [{ name: 'days', description: 'Window in days.' }] },
  { path: '/api/analytics/{shortCode}/forecast', method: 'get', summary: 'Click forecast for a link', tag: 'Analytics', scopes: ANALYTICS, query: [{ name: 'target', description: 'Click target to project to.' }] },
  { path: '/api/analytics/{shortCode}/heatmap', method: 'get', summary: 'Best-time click heatmap for a link', tag: 'Analytics', scopes: ANALYTICS },
  { path: '/api/analytics/{shortCode}/utm', method: 'get', summary: 'UTM breakdown for a link', tag: 'Analytics', scopes: ANALYTICS },
  { path: '/api/analytics/{shortCode}/visitors', method: 'get', summary: 'New vs returning visitors for a link', tag: 'Analytics', scopes: ANALYTICS, query: [{ name: 'days', description: 'Window in days.' }] },
  { path: '/api/analytics', method: 'get', summary: 'Aggregated analytics across links', tag: 'Analytics', scopes: ANALYTICS },
  { path: '/api/links/duplicates', method: 'get', summary: 'Find links sharing a destination', tag: 'Links', scopes: ANALYTICS },
  { path: '/api/links/expiring', method: 'get', summary: 'Links expiring soon', tag: 'Links', scopes: LINK_READ },
  { path: '/api/links/utm-hygiene', method: 'get', summary: 'Audit links for missing or inconsistent UTM parameters', tag: 'Analytics', scopes: ANALYTICS },
  { path: '/api/workspaces/{workspaceId}/folders', method: 'get', summary: 'List workspace folders', tag: 'Workspaces', scopes: LINK_READ },
  { path: '/api/workspaces/{workspaceId}/utm-templates', method: 'get', summary: 'List workspace UTM templates', tag: 'Workspaces', scopes: LINK_READ },
  { path: '/api/workspaces', method: 'get', summary: 'List your workspaces', tag: 'Workspaces', scopes: LINK_READ },
  { path: '/api/webhooks', method: 'get', summary: 'List webhook endpoints', tag: 'Webhooks', scopes: ['webhooks:write'] },
  { path: '/api/webhooks', method: 'post', summary: 'Create a webhook endpoint', tag: 'Webhooks', scopes: ['webhooks:write'] },
  { path: '/api/analytics/countries', method: 'get', summary: 'Clicks and conversions by country', tag: 'Analytics', scopes: ANALYTICS },
  { path: '/api/analytics/referrers', method: 'get', summary: 'Clicks and conversions by referrer', tag: 'Analytics', scopes: ANALYTICS },
  { path: '/api/analytics/broken', method: 'get', summary: 'Links whose destination is failing', tag: 'Analytics', scopes: ANALYTICS },
  { path: '/api/analytics/concentration', method: 'get', summary: 'How concentrated clicks are across links', tag: 'Analytics', scopes: ANALYTICS },
  { path: '/api/analytics/drops', method: 'get', summary: 'Links with a sharp drop in clicks', tag: 'Analytics', scopes: ANALYTICS },
  { path: '/api/analytics/insecure', method: 'get', summary: 'Links pointing at non-HTTPS destinations, with traffic', tag: 'Analytics', scopes: ANALYTICS },
  { path: '/api/analytics/lifespan', method: 'get', summary: 'Click lifespan of links', tag: 'Analytics', scopes: ANALYTICS },
  { path: '/api/analytics/qr-scans', method: 'get', summary: 'Scans of QR codes', tag: 'Analytics', scopes: ANALYTICS },
  { path: '/api/analytics/spikes', method: 'get', summary: 'Links with unusual click spikes', tag: 'Analytics', scopes: ANALYTICS },
  { path: '/api/analytics/tech', method: 'get', summary: 'Browser, OS and device breakdown', tag: 'Analytics', scopes: ANALYTICS },
  { path: '/api/analytics/utm-coverage', method: 'get', summary: 'Share of links carrying UTM parameters', tag: 'Analytics', scopes: ANALYTICS },
  { path: '/api/analytics/tags', method: 'get', summary: 'Performance per tag', tag: 'Analytics', scopes: ANALYTICS },
  { path: '/api/analytics/folders', method: 'get', summary: 'Performance per folder', tag: 'Analytics', scopes: ANALYTICS },
  { path: '/api/analytics/cities', method: 'get', summary: 'Clicks and conversions by city', tag: 'Analytics', scopes: ANALYTICS },
  { path: '/api/analytics/languages', method: 'get', summary: 'Clicks and conversions by language', tag: 'Analytics', scopes: ANALYTICS },
  { path: '/api/analytics/creators', method: 'get', summary: 'Performance per creator', tag: 'Analytics', scopes: ANALYTICS },
  { path: '/api/analytics/conversions', method: 'get', summary: 'Conversion performance per link', tag: 'Analytics', scopes: ANALYTICS },
  { path: '/api/analytics/traffic-quality', method: 'get', summary: 'Human, bot and AI traffic split', tag: 'Analytics', scopes: ANALYTICS },
  { path: '/api/analytics/compare', method: 'get', summary: 'Period-over-period comparison', tag: 'Analytics', scopes: ANALYTICS },
  { path: '/api/links/attention', method: 'get', summary: 'Links needing attention (broken, expiring, unsafe)', tag: 'Links', scopes: ANALYTICS },
  { path: '/api/links/hygiene', method: 'get', summary: 'Link hygiene report', tag: 'Links', scopes: ANALYTICS },
  { path: '/api/links/lookup', method: 'get', summary: 'Look up links by destination URL', tag: 'Links', scopes: ANALYTICS },
  { path: '/api/links/untagged', method: 'get', summary: 'Links with no tags', tag: 'Links', scopes: ANALYTICS },
  { path: '/api/links/chains', method: 'get', summary: 'Links whose destination is another short link', tag: 'Links', scopes: ANALYTICS },
  { path: '/api/links/insecure', method: 'get', summary: 'Links with non-HTTPS destinations', tag: 'Links', scopes: ANALYTICS },
  { path: '/api/links/missing-previews', method: 'get', summary: 'Links missing a social preview', tag: 'Links', scopes: ANALYTICS },
  { path: '/api/links/tracking-params', method: 'get', summary: 'Links with tracking parameters in the destination', tag: 'Links', scopes: ANALYTICS },
  { path: '/api/links/trace', method: 'get', summary: 'Follow a redirect chain', tag: 'Links', scopes: LINK_READ },
  { path: '/api/links/trash', method: 'get', summary: 'List trashed links', tag: 'Links', scopes: LINK_READ },
  { path: '/api/links/trash', method: 'post', summary: 'Restore or purge trashed links', tag: 'Links', scopes: ['links:write'] },
  { path: '/api/links/qr-zip', method: 'post', summary: 'Download QR codes for many links as a ZIP', tag: 'Links', scopes: LINK_READ },
]

type Json = Record<string, unknown>

function operationObject(op: OperationDef): Json {
  const parameters: Json[] = []
  for (const m of op.path.matchAll(/\{(\w+)\}/g)) {
    parameters.push({ name: m[1], in: 'path', required: true, schema: { type: 'string' } })
  }
  for (const q of op.query ?? []) {
    parameters.push({ name: q.name, in: 'query', required: q.required === true, description: q.description, schema: { type: 'string' } })
  }
  const out: Json = {
    summary: op.summary,
    tags: [op.tag],
    security: [{ bearerAuth: op.scopes }],
    responses: {
      '200': { description: 'Success' },
      '401': { description: 'Missing or invalid credentials' },
      '403': { description: 'API key lacks the required scope' },
      '429': { description: 'Rate limited; see RateLimit headers' },
    },
  }
  if (op.scopes.length > 0) out['x-required-scopes-any-of'] = op.scopes
  if (parameters.length > 0) out.parameters = parameters
  if (op.body) {
    const required = Object.entries(op.body).filter(([, v]) => v.required).map(([k]) => k)
    out.requestBody = {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: Object.fromEntries(Object.entries(op.body).map(([k, v]) => [k, { type: v.type, description: v.description }])),
            ...(required.length > 0 ? { required } : {}),
          },
        },
      },
    }
  }
  return out
}

export function buildOpenApiDocument(serverUrl: string): Json {
  const paths: Record<string, Json> = {}
  for (const op of OPERATIONS) {
    paths[op.path] ??= {}
    paths[op.path][op.method] = operationObject(op)
  }
  return {
    openapi: '3.1.0',
    info: { title: 'QuickLink API', version: '1.0.0', description: 'Authenticate with a Bearer API key created under Manage → API keys.' },
    servers: [{ url: serverUrl }],
    tags: [...new Set(OPERATIONS.map((o) => o.tag))].map((name) => ({ name })),
    paths,
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', description: 'API key' } } },
  }
}

/** Route file for an OpenAPI path, relative to src/app. */
export function routeFileFor(path: string): string {
  return path.replace(/\{(\w+)\}/g, '[$1]').replace(/^\//, '') + '/route.ts'
}
