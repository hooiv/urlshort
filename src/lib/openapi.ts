/**
 * OpenAPI 3.1 description of the public REST API, served at /api/openapi.json.
 * Operations are declared once in OPERATIONS; a test asserts every documented
 * path maps to a real route file and every method is exported by it, so the
 * spec cannot silently drift from the code.
 */
export type HttpMethod = 'get' | 'post' | 'patch' | 'delete'

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
  { path: '/api/links/duplicates', method: 'get', summary: 'Find links sharing a destination', tag: 'Links', scopes: ANALYTICS },
  { path: '/api/links/expiring', method: 'get', summary: 'Links expiring soon', tag: 'Links', scopes: LINK_READ },
  { path: '/api/workspaces', method: 'get', summary: 'List your workspaces', tag: 'Workspaces', scopes: LINK_READ },
  { path: '/api/webhooks', method: 'get', summary: 'List webhook endpoints', tag: 'Webhooks', scopes: ['webhooks:write'] },
  { path: '/api/webhooks', method: 'post', summary: 'Create a webhook endpoint', tag: 'Webhooks', scopes: ['webhooks:write'] },
  { path: '/api/analytics/countries', method: 'get', summary: 'Clicks and conversions by country', tag: 'Analytics', scopes: ANALYTICS },
  { path: '/api/analytics/referrers', method: 'get', summary: 'Clicks and conversions by referrer', tag: 'Analytics', scopes: ANALYTICS },
  { path: '/api/analytics/tags', method: 'get', summary: 'Performance per tag', tag: 'Analytics', scopes: ANALYTICS },
  { path: '/api/analytics/folders', method: 'get', summary: 'Performance per folder', tag: 'Analytics', scopes: ANALYTICS },
  { path: '/api/analytics/cities', method: 'get', summary: 'Clicks and conversions by city', tag: 'Analytics', scopes: ANALYTICS },
  { path: '/api/analytics/languages', method: 'get', summary: 'Clicks and conversions by language', tag: 'Analytics', scopes: ANALYTICS },
  { path: '/api/analytics/creators', method: 'get', summary: 'Performance per creator', tag: 'Analytics', scopes: ANALYTICS },
  { path: '/api/analytics/conversions', method: 'get', summary: 'Conversion performance per link', tag: 'Analytics', scopes: ANALYTICS },
  { path: '/api/analytics/traffic-quality', method: 'get', summary: 'Human, bot and AI traffic split', tag: 'Analytics', scopes: ANALYTICS },
  { path: '/api/analytics/compare', method: 'get', summary: 'Period-over-period comparison', tag: 'Analytics', scopes: ANALYTICS },
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
