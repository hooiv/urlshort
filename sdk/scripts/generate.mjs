// Hand-written generator (plain node, zero dependencies).
//
// Reads sdk/openapi.json (canonical contract) AND the real Next.js route
// handlers under src/app/api, then emits sdk/src/generated.ts.
//
// Run: `npm run generate` from sdk/ (invoked automatically by `npm run build`).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const apiDir = path.resolve(root, '..', 'src', 'app', 'api')

const spec = JSON.parse(fs.readFileSync(path.join(root, 'openapi.json'), 'utf8'))
const schemas = spec.components?.schemas ?? {}
if (!spec.openapi) throw new Error('openapi.json: missing "openapi" version marker')
if (!spec.paths || typeof spec.paths !== 'object') throw new Error('openapi.json: missing "paths" object')

// ---------------------------------------------------------------------------
// 1. Spot-check the contract against the ACTUAL API routes on disk.
//    Every spec path must map to a real route.ts handler that implements the
//    declared HTTP method. This keeps openapi.json truthful by construction.
// ---------------------------------------------------------------------------
function specPathToRouteFile(specPath) {
  const rel = String(specPath).replace(/^\/api\//, '').replace(/\{([^}]+)\}/g, '[$1]')
  return path.join(apiDir, rel, 'route.ts')
}

const drift = []
for (const [specPath, methods] of Object.entries(spec.paths)) {
  const file = specPathToRouteFile(specPath)
  if (!fs.existsSync(file)) {
    drift.push(`missing route file for "${specPath}" (expected ${path.relative(root, file)})`)
    continue
  }
  const source = fs.readFileSync(file, 'utf8')
  for (const [method, operation] of Object.entries(methods ?? {})) {
    if (method === 'parameters' || !operation || typeof operation !== 'object' || !operation.operationId) continue
    const needle = `export async function ${method.toUpperCase()}`
    if (!source.includes(needle)) {
      drift.push(`"${method.toUpperCase()} ${specPath}" (${operation.operationId}) has no "${needle}" in ${path.relative(root, file)}`)
    }
  }
}
if (drift.length > 0) {
  throw new Error(`openapi.json drifts from src/app/api routes:\n- ${drift.join('\n- ')}\nFix openapi.json (additive corrections only) or the route handler, then re-run.`)
}

// ---------------------------------------------------------------------------
// 2. OpenAPI schema -> TypeScript type.
// ---------------------------------------------------------------------------
const refName = (ref) => {
  const name = String(ref).split('/').pop()
  if (!schemas[name]) throw new Error(`openapi.json: $ref "${ref}" has no matching components.schemas entry`)
  return name
}

const ts = (schema, fallback = 'unknown') => {
  if (schema === true) return 'unknown'
  if (schema === false) return 'never'
  if (!schema || typeof schema !== 'object') return fallback
  if (schema.$ref) return refName(schema.$ref)
  if (Array.isArray(schema.oneOf)) return schema.oneOf.map((s) => ts(s)).join(' | ')
  if (Array.isArray(schema.anyOf)) return schema.anyOf.map((s) => ts(s)).join(' | ')
  if (Array.isArray(schema.allOf)) return schema.allOf.map((s) => ts(s)).join(' & ')
  if (Array.isArray(schema.enum)) return schema.enum.map((v) => JSON.stringify(v)).join(' | ')
  if (Array.isArray(schema.type)) {
    const parts = schema.type.map((t) => (t === 'null' ? 'null' : ts({ ...schema, type: t })))
    return [...new Set(parts)].join(' | ')
  }
  if (schema.type === 'array') return `Array<${ts(schema.items)}>`
  if (schema.type === 'object' || schema.properties || schema.additionalProperties) {
    const entries = Object.entries(schema.properties ?? {})
    const required = new Set(schema.required ?? [])
    if (entries.length === 0) return 'Record<string, unknown>'
    return `{ ${entries.map(([name, value]) => `${JSON.stringify(name)}${required.has(name) ? '' : '?'}: ${ts(value)}`).join('; ')} }`
  }
  if (schema.enum) return schema.enum.map((v) => JSON.stringify(v)).join(' | ')
  if (schema.type === 'integer' || schema.type === 'number') return 'number'
  if (schema.type === 'boolean') return 'boolean'
  if (schema.type === 'string') return 'string'
  if (schema.type === 'null') return 'null'
  return fallback
}

// ---------------------------------------------------------------------------
// 3. Emit the typed client.
// ---------------------------------------------------------------------------
const lines = [
  '// GENERATED FROM openapi.json - DO NOT EDIT',
  '// Generator: sdk/scripts/generate.mjs (spot-checked against src/app/api route handlers).',
  '// To change this file, edit sdk/openapi.json (additive corrections only) or the generator,',
  '// then run `npm run generate`. Hand-written helpers live in sdk/src/client.ts.',
  '',
  '',
]

for (const [name, schema] of Object.entries(schemas)) lines.push(`export type ${name} = ${ts(schema)}`)

lines.push(
  '',
  'export type ApiErrorBody = { error: string; requestId?: string }',
  '',
  'export type RequestOptions = {',
  '  /** Forwarded as the `Idempotency-Key` header for safe retries of POST/PATCH writes. */',
  '  idempotencyKey?: string;',
  '  /** Caller-provided cancellation signal. The client never creates side effects after abort. */',
  '  signal?: AbortSignal;',
  '  /** Per-request timeout in milliseconds. Overrides the client default. `0` disables the timeout. */',
  '  timeoutMs?: number;',
  '}',
  '',
  'export type ClientOptions = {',
  '  /** Absolute base URL of the QuickLink deployment, e.g. `https://links.example.com`. */',
  '  baseUrl: string;',
  '  /** API key (`qlk_...`). Sent only in the `x-api-key` header; never logged or serialized. */',
  '  apiKey: string;',
  '  /** Injectable fetch implementation (tests, edge runtimes). Defaults to global fetch. */',
  '  fetch?: typeof fetch;',
  '  /** Default timeout in milliseconds applied to every request. Defaults to 15000. `0` disables it. */',
  '  timeoutMs?: number;',
  '}',
  '',
  '/** Base error for every non-2xx QuickLink API response. */',
  'export class QuickLinkError extends Error {',
  '  readonly status: number',
  '  readonly body: ApiErrorBody',
  '  readonly code: string',
  '  readonly requestId?: string',
  '  /** Retry delay hint in seconds (only set for 429 rate-limit responses). */',
  '  readonly retryAfter?: number',
  '  constructor(status: number, body: ApiErrorBody, init: { code?: string; retryAfter?: number; requestId?: string } = {}) {',
  '    super(body?.error || `HTTP ${status}`)',
  '    this.name = "QuickLinkError"',
  '    this.status = status',
  '    this.body = body',
  '    this.code = init.code ?? `http_${status}`',
  '    if (init.requestId ?? body?.requestId) this.requestId = init.requestId ?? body.requestId',
  '    if (init.retryAfter !== undefined) this.retryAfter = init.retryAfter',
  '  }',
  '}',
  '',
  '/** The API rate-limited the caller. Inspect `retryAfter` (seconds) before retrying. */',
  'export class RateLimitError extends QuickLinkError {',
  '  constructor(status: number, body: ApiErrorBody, retryAfter?: number) {',
  '    super(status, body, { code: "rate_limited", retryAfter, requestId: body?.requestId })',
  '    this.name = "RateLimitError"',
  '  }',
  '  /** Alias for `retryAfter`: delay in seconds suggested via the `Retry-After` header. */',
  '  get retryAfterSeconds(): number | undefined { return this.retryAfter }',
  '}',
  '',
  '/** Authentication or authorization failed (HTTP 401/403). The key may be missing, revoked, or lack workspace permission. */',
  'export class AuthenticationError extends QuickLinkError {',
  '  constructor(status: number, body: ApiErrorBody) {',
  '    super(status, body, { code: status === 403 ? "forbidden" : "unauthorized", requestId: body?.requestId })',
  '    this.name = "AuthenticationError"',
  '  }',
  '}',
  '',
  '/** The request was rejected as invalid (HTTP 400/409/422). Inspect `body.error` for the reason. */',
  'export class ValidationError extends QuickLinkError {',
  '  constructor(status: number, body: ApiErrorBody) {',
  '    const code = status === 409 ? "conflict" : status === 422 ? "unprocessable" : "bad_request"',
  '    super(status, body, { code, requestId: body?.requestId })',
  '    this.name = "ValidationError"',
  '  }',
  '}',
  '',
  '/** The referenced resource does not exist or is not visible to this key (HTTP 404). */',
  'export class NotFoundError extends QuickLinkError {',
  '  constructor(status: number, body: ApiErrorBody) {',
  '    super(status, body, { code: "not_found", requestId: body?.requestId })',
  '    this.name = "NotFoundError"',
  '  }',
  '}',
  '',
  'function safeJsonParse(text: string): unknown {',
  '  try { return JSON.parse(text) } catch { return null }',
  '}',
  '',
  '/** Parse a `Retry-After` header (seconds or HTTP date) into seconds. */',
  'function parseRetryAfterSeconds(value: string | null): number | undefined {',
  '  if (!value) return undefined',
  '  const trimmed = value.trim()',
  '  if (/^\\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10)',
  '  const when = Date.parse(trimmed)',
  '  if (!Number.isNaN(when)) return Math.max(0, Math.ceil((when - Date.now()) / 1000))',
  '  return undefined',
  '}',
  '',
  'function toApiErrorBody(status: number, body: unknown): ApiErrorBody {',
  '  if (body !== null && typeof body === "object" && "error" in body) {',
  '    const record = body as Record<string, unknown>',
  '    if (typeof record.error === "string" && record.error) {',
  '      const out: ApiErrorBody = { error: record.error }',
  '      if (typeof record.requestId === "string") out.requestId = record.requestId',
  '      return out',
  '    }',
  '  }',
  '  return { error: `HTTP ${status}` }',
  '}',
  '',
  'function throwApiError(status: number, body: unknown, headers: Headers): never {',
  '  const normalized = toApiErrorBody(status, body)',
  '  if (status === 429) throw new RateLimitError(status, normalized, parseRetryAfterSeconds(headers.get("Retry-After")))',
  '  if (status === 401 || status === 403) throw new AuthenticationError(status, normalized)',
  '  if (status === 400 || status === 409 || status === 422) throw new ValidationError(status, normalized)',
  '  if (status === 404) throw new NotFoundError(status, normalized)',
  '  throw new QuickLinkError(status, normalized)',
  '}',
  '',
  'function appendQuery(route: string, query: Record<string, unknown> | undefined): string {',
  '  if (!query) return route',
  '  const params = new URLSearchParams()',
  '  for (const [key, value] of Object.entries(query)) {',
  '    if (value === undefined || value === null) continue',
  '    if (Array.isArray(value)) {',
  '      for (const item of value) {',
  '        if (item !== undefined && item !== null) params.append(key, String(item))',
  '      }',
  '    } else {',
  '      params.append(key, String(value))',
  '    }',
  '  }',
  '  const qs = params.toString()',
  '  return qs ? `${route}?${qs}` : route',
  '}',
  '',
  'export class QuickLinkClient {',
  '  private readonly baseUrl: string',
  '  private readonly apiKey: string',
  '  private readonly fetcher: typeof fetch',
  '  private readonly timeoutMs: number',
  '  constructor(options: ClientOptions) {',
  '    if (!options || typeof options.baseUrl !== "string" || !options.baseUrl.trim()) {',
  '      throw new TypeError("QuickLinkClient: baseUrl is required")',
  '    }',
  '    if (!options || typeof options.apiKey !== "string" || !options.apiKey) {',
  '      throw new TypeError("QuickLinkClient: apiKey is required")',
  '    }',
  '    const normalized = options.baseUrl.trim().replace(/\\/+$/, "")',
  '    try {',
  '      const parsed = new URL(normalized)',
  '      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new TypeError("bad protocol")',
  '    } catch {',
  '      throw new TypeError("QuickLinkClient: baseUrl must be an absolute http(s) URL")',
  '    }',
  '    const fetcher = options.fetch ?? globalThis.fetch',
  '    if (typeof fetcher !== "function") throw new TypeError("QuickLinkClient: a fetch implementation is required")',
  '    this.baseUrl = normalized',
  '    // SECURITY: the key is stored privately, sent only as the `x-api-key` header,',
  '    // and never written to logs, errors, or serialized output (see toJSON below).',
  '    this.apiKey = options.apiKey',
  '    this.fetcher = fetcher',
  '    this.timeoutMs = options.timeoutMs ?? 15000',
  '  }',
  '  /** Serialize without secrets: JSON.stringify(client) exposes only the base URL. */',
  '  toJSON(): { baseUrl: string } { return { baseUrl: this.baseUrl } }',
  '  private async request<T>(path: string, init: RequestInit = {}, options: RequestOptions = {}): Promise<T> {',
  '    const headers = new Headers(init.headers)',
  '    headers.set("accept", "application/json")',
  '    if (init.body !== undefined && init.body !== null) headers.set("content-type", "application/json")',
  '    headers.set("x-api-key", this.apiKey)',
  '    if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey)',
  '    const timeoutMs = options.timeoutMs ?? this.timeoutMs',
  '    const inputSignal = options.signal',
  '    if (inputSignal?.aborted) throw (inputSignal.reason ?? new DOMException("The operation was aborted.", "AbortError"))',
  '    const controller = new AbortController()',
  '    const onAbort = (): void => { controller.abort((inputSignal as AbortSignal | undefined)?.reason) }',
  '    let timer: ReturnType<typeof setTimeout> | undefined',
  '    let timedOut = false',
  '    try {',
  '      if (inputSignal) inputSignal.addEventListener("abort", onAbort, { once: true })',
  '      if (timeoutMs > 0) {',
  '        timer = setTimeout(() => {',
  '          timedOut = true',
  '          controller.abort(new DOMException(`Request timed out after ${timeoutMs}ms`, "TimeoutError"))',
  '        }, timeoutMs)',
  '      }',
  '      let response: Response',
  '      try {',
  '        response = await this.fetcher(`${this.baseUrl}${path}`, { ...init, headers, signal: controller.signal })',
  '      } catch (error) {',
  '        if (timedOut) throw new DOMException(`Request timed out after ${timeoutMs}ms`, "TimeoutError")',
  '        throw error',
  '      }',
  '      if (response.status === 204) return undefined as T',
  '      const text = await response.text().catch(() => "")',
  '      const parsed: unknown = text ? safeJsonParse(text) : null',
  '      if (!response.ok) throwApiError(response.status, parsed, response.headers)',
  '      if (parsed === null || parsed === undefined) return undefined as T',
  '      return parsed as T',
  '    } finally {',
  '      if (timer !== undefined) clearTimeout(timer)',
  '      if (inputSignal) inputSignal.removeEventListener("abort", onAbort)',
  '    }',
  '  }',
)

for (const [specPath, methods] of Object.entries(spec.paths ?? {})) {
  for (const [method, operation] of Object.entries(methods ?? {})) {
    if (method === 'parameters' || !operation || typeof operation !== 'object' || !operation.operationId) continue
    const params = Array.isArray(operation.parameters) ? operation.parameters : []
    const pathParams = params.filter((p) => p && p.in === 'path')
    const queryParams = params.filter((p) => p && p.in === 'query')
    const requestSchema = operation.requestBody?.content?.['application/json']?.schema
    const responses = operation.responses ?? {}
    const response = responses['200'] ?? responses['201'] ?? Object.values(responses)[0]
    const responseSchema = response?.content?.['application/json']?.schema
    const returnType = responseSchema ? ts(responseSchema) : 'void'
    const args = pathParams.map((p) => `${p.name}: string`)
    let queryType = ''
    if (queryParams.length > 0) {
      queryType = `{ ${queryParams.map((p) => `${JSON.stringify(p.name)}${p.required ? '' : '?'}: ${ts(p.schema, 'string')}`).join('; ')} }`
      if (!requestSchema) args.push(`query?: ${queryType}`)
    }
    if (requestSchema) {
      const bodyRequired = operation.requestBody?.required !== false
      args.push(bodyRequired ? `input: ${ts(requestSchema)}` : `input?: ${ts(requestSchema)}`)
      if (queryParams.length > 0) args.push(`query?: ${queryType}`)
    }
    args.push('options?: RequestOptions')
    let url = String(specPath)
    for (const p of pathParams) url = url.replace(`{${p.name}}`, '${encodeURIComponent(' + p.name + ')}')
    const urlExpr = queryParams.length > 0 ? 'appendQuery(`' + url + '`, query)' : '`' + url + '`'
    const hasBody = Boolean(requestSchema)
    const init = hasBody
      ? `{ method: "${method.toUpperCase()}", body: JSON.stringify(input) }`
      : `{ method: "${method.toUpperCase()}" }`
    lines.push(`  ${operation.operationId}(${args.join(', ')}): Promise<${returnType}> { return this.request<${returnType}>(${urlExpr}, ${init}, options) }`)
  }
}

lines.push(
  '  /**',
  '   * Resolve a short code to its stored destination (authenticated).',
  '   * Convenience alias over GET /api/links/{shortCode}; no separate resolve endpoint exists.',
  '   */',
  '  async resolve(shortCode: string, options?: RequestOptions): Promise<ShortLinkDetail> { return this.getLink(shortCode, options) }',
  '}',
  '',
  '/** Create a QuickLink API client. Equivalent to `new QuickLinkClient(options)`. */',
  'export function createClient(options: ClientOptions): QuickLinkClient { return new QuickLinkClient(options) }',
  '',
  '/** Alias for the client class, convenient for type positions. */',
  'export type Client = QuickLinkClient',
  '',
)

fs.mkdirSync(path.join(root, 'src'), { recursive: true })
fs.writeFileSync(path.join(root, 'src', 'generated.ts'), `${lines.join('\n')}\n`)
console.error(`SDK generator: verified ${Object.keys(spec.paths).length} spec paths against src/app/api handlers; wrote src/generated.ts`)
