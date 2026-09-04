// GENERATED FROM openapi.json - DO NOT EDIT
// Generator: sdk/scripts/generate.mjs (spot-checked against src/app/api route handlers).
// To change this file, edit sdk/openapi.json (additive corrections only) or the generator,
// then run `npm run generate`. Hand-written helpers live in sdk/src/client.ts.


export type OptimizationObjective = "conversion_rate" | "revenue_per_click" | "revenue" | "conversion_value"
export type CampaignVariant = { "id": string; "name": string; "destinationUrl": string; "weight": number; "enabled": boolean; "isControl": boolean; "clicks": number; "conversions": number; "valueCents": string }
export type Campaign = { "id": string; "workspaceId": string; "name": string; "slug": string; "status": string; "objective": OptimizationObjective; "version": number; "variants": Array<CampaignVariant> }
export type CreateCampaignInput = { "name": string; "slug": string; "objective"?: OptimizationObjective; "currency"?: string; "autoOptimize"?: boolean; "confidenceThreshold"?: number; "minSampleSize"?: number; "minConversions"?: number; "maxTrafficShiftPercent"?: number; "variants": Array<{ "name": string; "destinationUrl": string; "weight": number; "isControl"?: boolean }> }
export type ShortLink = { "id": string; "originalUrl": string; "shortCode": string; "shortUrl": string; "managementUrl"?: string | null; "title"?: string | null; "description"?: string | null; "ogImage"?: string | null; "clicks": number; "createdAt": string }
export type ShortLinkDetail = { "id": string; "originalUrl": string; "shortCode": string; "title"?: string | null; "description"?: string | null; "ogImage"?: string | null; "tags"?: Array<string>; "clicks"?: number; "createdAt"?: string; "updatedAt"?: string; "expiresAt"?: string | null; "expiredUrl"?: string | null; "maxClicks"?: number | null; "isActive"?: boolean; "cloaked"?: boolean; "webhookUrl"?: string | null; "metaPixelId"?: string | null; "googleTagId"?: string | null; "xPixelId"?: string | null; "riskStatus"?: string; "healthStatus"?: string }
export type CreateShortLinkInput = { "url": string; "customCode"?: string; "title"?: string; "description"?: string; "ogImage"?: string; "tags"?: Array<string>; "password"?: string; "expiresAt"?: string; "expiredUrl"?: string; "maxClicks"?: number; "workspaceId"?: string; "cloaked"?: boolean }
export type UpdateLinkInput = { "title"?: string | null; "description"?: string | null; "ogImage"?: string | null; "isActive"?: boolean; "tags"?: Array<string>; "expiresAt"?: string | null; "expiredUrl"?: string | null; "password"?: string | null; "destinationUrl"?: string; "maxClicks"?: number | null; "cloaked"?: boolean; "webhookUrl"?: string | null }
export type ListLinksResponse = { "links": Array<ShortLinkDetail>; "nextCursor"?: string | null }
export type DeleteLinkResult = { "deleted": boolean; "shortCode": string }
export type AnalyticsResponse = { "url": Record<string, unknown>; "window": Record<string, unknown>; "filters"?: Record<string, unknown>; "analytics": Record<string, unknown> }
export type WebhookEndpoint = { "id": string; "url": string; "isActive": boolean; "events": Array<string>; "createdAt": string; "updatedAt": string; "deliveriesCount"?: number; "secretHint"?: string }
export type WebhookEndpointWithSecret = { "id": string; "url": string; "isActive"?: boolean; "events"?: Array<string>; "secret": string; "createdAt"?: string; "updatedAt"?: string }
export type CreateWebhookInput = { "url": string; "events"?: Array<string> }
export type WebhookTestResult = { "success": boolean; "attempted"?: boolean; "deliveryId"?: string; "status"?: string; "statusCode"?: number | null; "latencyMs"?: number | null; "responseSnippet"?: string | null }
export type UnfurlInput = { "url": string }
export type UnfurlResult = { "url": string; "title"?: string | null; "description"?: string | null; "image"?: string | null; "icon"?: string | null; "siteName"?: string | null }

export type ApiErrorBody = { error: string; requestId?: string }

export type RequestOptions = {
  /** Forwarded as the `Idempotency-Key` header for safe retries of POST/PATCH writes. */
  idempotencyKey?: string;
  /** Caller-provided cancellation signal. The client never creates side effects after abort. */
  signal?: AbortSignal;
  /** Per-request timeout in milliseconds. Overrides the client default. `0` disables the timeout. */
  timeoutMs?: number;
}

export type ClientOptions = {
  /** Absolute base URL of the QuickLink deployment, e.g. `https://links.example.com`. */
  baseUrl: string;
  /** API key (`qlk_...`). Sent only in the `x-api-key` header; never logged or serialized. */
  apiKey: string;
  /** Injectable fetch implementation (tests, edge runtimes). Defaults to global fetch. */
  fetch?: typeof fetch;
  /** Default timeout in milliseconds applied to every request. Defaults to 15000. `0` disables it. */
  timeoutMs?: number;
}

/** Base error for every non-2xx QuickLink API response. */
export class QuickLinkError extends Error {
  readonly status: number
  readonly body: ApiErrorBody
  readonly code: string
  readonly requestId?: string
  /** Retry delay hint in seconds (only set for 429 rate-limit responses). */
  readonly retryAfter?: number
  constructor(status: number, body: ApiErrorBody, init: { code?: string; retryAfter?: number; requestId?: string } = {}) {
    super(body?.error || `HTTP ${status}`)
    this.name = "QuickLinkError"
    this.status = status
    this.body = body
    this.code = init.code ?? `http_${status}`
    if (init.requestId ?? body?.requestId) this.requestId = init.requestId ?? body.requestId
    if (init.retryAfter !== undefined) this.retryAfter = init.retryAfter
  }
}

/** The API rate-limited the caller. Inspect `retryAfter` (seconds) before retrying. */
export class RateLimitError extends QuickLinkError {
  constructor(status: number, body: ApiErrorBody, retryAfter?: number) {
    super(status, body, { code: "rate_limited", retryAfter, requestId: body?.requestId })
    this.name = "RateLimitError"
  }
  /** Alias for `retryAfter`: delay in seconds suggested via the `Retry-After` header. */
  get retryAfterSeconds(): number | undefined { return this.retryAfter }
}

/** Authentication or authorization failed (HTTP 401/403). The key may be missing, revoked, or lack workspace permission. */
export class AuthenticationError extends QuickLinkError {
  constructor(status: number, body: ApiErrorBody) {
    super(status, body, { code: status === 403 ? "forbidden" : "unauthorized", requestId: body?.requestId })
    this.name = "AuthenticationError"
  }
}

/** The request was rejected as invalid (HTTP 400/409/422). Inspect `body.error` for the reason. */
export class ValidationError extends QuickLinkError {
  constructor(status: number, body: ApiErrorBody) {
    const code = status === 409 ? "conflict" : status === 422 ? "unprocessable" : "bad_request"
    super(status, body, { code, requestId: body?.requestId })
    this.name = "ValidationError"
  }
}

/** The referenced resource does not exist or is not visible to this key (HTTP 404). */
export class NotFoundError extends QuickLinkError {
  constructor(status: number, body: ApiErrorBody) {
    super(status, body, { code: "not_found", requestId: body?.requestId })
    this.name = "NotFoundError"
  }
}

function safeJsonParse(text: string): unknown {
  try { return JSON.parse(text) } catch { return null }
}

/** Parse a `Retry-After` header (seconds or HTTP date) into seconds. */
function parseRetryAfterSeconds(value: string | null): number | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (/^\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10)
  const when = Date.parse(trimmed)
  if (!Number.isNaN(when)) return Math.max(0, Math.ceil((when - Date.now()) / 1000))
  return undefined
}

function toApiErrorBody(status: number, body: unknown): ApiErrorBody {
  if (body !== null && typeof body === "object" && "error" in body) {
    const record = body as Record<string, unknown>
    if (typeof record.error === "string" && record.error) {
      const out: ApiErrorBody = { error: record.error }
      if (typeof record.requestId === "string") out.requestId = record.requestId
      return out
    }
  }
  return { error: `HTTP ${status}` }
}

function throwApiError(status: number, body: unknown, headers: Headers): never {
  const normalized = toApiErrorBody(status, body)
  if (status === 429) throw new RateLimitError(status, normalized, parseRetryAfterSeconds(headers.get("Retry-After")))
  if (status === 401 || status === 403) throw new AuthenticationError(status, normalized)
  if (status === 400 || status === 409 || status === 422) throw new ValidationError(status, normalized)
  if (status === 404) throw new NotFoundError(status, normalized)
  throw new QuickLinkError(status, normalized)
}

function appendQuery(route: string, query: Record<string, unknown> | undefined): string {
  if (!query) return route
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null) params.append(key, String(item))
      }
    } else {
      params.append(key, String(value))
    }
  }
  const qs = params.toString()
  return qs ? `${route}?${qs}` : route
}

export class QuickLinkClient {
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly fetcher: typeof fetch
  private readonly timeoutMs: number
  constructor(options: ClientOptions) {
    if (!options || typeof options.baseUrl !== "string" || !options.baseUrl.trim()) {
      throw new TypeError("QuickLinkClient: baseUrl is required")
    }
    if (!options || typeof options.apiKey !== "string" || !options.apiKey) {
      throw new TypeError("QuickLinkClient: apiKey is required")
    }
    const normalized = options.baseUrl.trim().replace(/\/+$/, "")
    try {
      const parsed = new URL(normalized)
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new TypeError("bad protocol")
    } catch {
      throw new TypeError("QuickLinkClient: baseUrl must be an absolute http(s) URL")
    }
    const fetcher = options.fetch ?? globalThis.fetch
    if (typeof fetcher !== "function") throw new TypeError("QuickLinkClient: a fetch implementation is required")
    this.baseUrl = normalized
    // SECURITY: the key is stored privately, sent only as the `x-api-key` header,
    // and never written to logs, errors, or serialized output (see toJSON below).
    this.apiKey = options.apiKey
    this.fetcher = fetcher
    this.timeoutMs = options.timeoutMs ?? 15000
  }
  /** Serialize without secrets: JSON.stringify(client) exposes only the base URL. */
  toJSON(): { baseUrl: string } { return { baseUrl: this.baseUrl } }
  private async request<T>(path: string, init: RequestInit = {}, options: RequestOptions = {}): Promise<T> {
    const headers = new Headers(init.headers)
    headers.set("accept", "application/json")
    if (init.body !== undefined && init.body !== null) headers.set("content-type", "application/json")
    headers.set("x-api-key", this.apiKey)
    if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey)
    const timeoutMs = options.timeoutMs ?? this.timeoutMs
    const inputSignal = options.signal
    if (inputSignal?.aborted) throw (inputSignal.reason ?? new DOMException("The operation was aborted.", "AbortError"))
    const controller = new AbortController()
    const onAbort = (): void => { controller.abort((inputSignal as AbortSignal | undefined)?.reason) }
    let timer: ReturnType<typeof setTimeout> | undefined
    let timedOut = false
    try {
      if (inputSignal) inputSignal.addEventListener("abort", onAbort, { once: true })
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          timedOut = true
          controller.abort(new DOMException(`Request timed out after ${timeoutMs}ms`, "TimeoutError"))
        }, timeoutMs)
      }
      let response: Response
      try {
        response = await this.fetcher(`${this.baseUrl}${path}`, { ...init, headers, signal: controller.signal })
      } catch (error) {
        if (timedOut) throw new DOMException(`Request timed out after ${timeoutMs}ms`, "TimeoutError")
        throw error
      }
      if (response.status === 204) return undefined as T
      const text = await response.text().catch(() => "")
      const parsed: unknown = text ? safeJsonParse(text) : null
      if (!response.ok) throwApiError(response.status, parsed, response.headers)
      if (parsed === null || parsed === undefined) return undefined as T
      return parsed as T
    } finally {
      if (timer !== undefined) clearTimeout(timer)
      if (inputSignal) inputSignal.removeEventListener("abort", onAbort)
    }
  }
  listCampaigns(options?: RequestOptions): Promise<Array<Campaign>> { return this.request<Array<Campaign>>(`/api/v1/campaigns`, { method: "GET" }, options) }
  createCampaign(input: CreateCampaignInput, options?: RequestOptions): Promise<{ "campaign": Campaign }> { return this.request<{ "campaign": Campaign }>(`/api/v1/campaigns/create`, { method: "POST", body: JSON.stringify(input) }, options) }
  getCampaign(campaignId: string, options?: RequestOptions): Promise<Campaign> { return this.request<Campaign>(`/api/campaigns/${encodeURIComponent(campaignId)}`, { method: "GET" }, options) }
  shorten(input: CreateShortLinkInput, options?: RequestOptions): Promise<ShortLink> { return this.request<ShortLink>(`/api/shorten`, { method: "POST", body: JSON.stringify(input) }, options) }
  listLinks(query?: { "search"?: string; "tag"?: string; "cursor"?: string; "take"?: number }, options?: RequestOptions): Promise<ListLinksResponse> { return this.request<ListLinksResponse>(appendQuery(`/api/shorten`, query), { method: "GET" }, options) }
  getLink(shortCode: string, options?: RequestOptions): Promise<ShortLinkDetail> { return this.request<ShortLinkDetail>(`/api/links/${encodeURIComponent(shortCode)}`, { method: "GET" }, options) }
  updateLink(shortCode: string, input: UpdateLinkInput, options?: RequestOptions): Promise<ShortLinkDetail> { return this.request<ShortLinkDetail>(`/api/links/${encodeURIComponent(shortCode)}`, { method: "PATCH", body: JSON.stringify(input) }, options) }
  deleteLink(shortCode: string, options?: RequestOptions): Promise<DeleteLinkResult> { return this.request<DeleteLinkResult>(`/api/links/${encodeURIComponent(shortCode)}`, { method: "DELETE" }, options) }
  getAnalytics(shortCode: string, query?: { "range"?: string; "from"?: string; "to"?: string; "country"?: string; "device"?: string; "referrer"?: string; "ruleId"?: string }, options?: RequestOptions): Promise<AnalyticsResponse> { return this.request<AnalyticsResponse>(appendQuery(`/api/analytics/${encodeURIComponent(shortCode)}`, query), { method: "GET" }, options) }
  listWebhooks(options?: RequestOptions): Promise<Array<WebhookEndpoint>> { return this.request<Array<WebhookEndpoint>>(`/api/webhooks`, { method: "GET" }, options) }
  createWebhook(input: CreateWebhookInput, options?: RequestOptions): Promise<WebhookEndpointWithSecret> { return this.request<WebhookEndpointWithSecret>(`/api/webhooks`, { method: "POST", body: JSON.stringify(input) }, options) }
  deleteWebhook(id: string, options?: RequestOptions): Promise<void> { return this.request<void>(`/api/webhooks/${encodeURIComponent(id)}`, { method: "DELETE" }, options) }
  testWebhook(id: string, options?: RequestOptions): Promise<WebhookTestResult> { return this.request<WebhookTestResult>(`/api/webhooks/${encodeURIComponent(id)}/test`, { method: "POST" }, options) }
  unfurlUrl(input: UnfurlInput, options?: RequestOptions): Promise<UnfurlResult> { return this.request<UnfurlResult>(`/api/unfurl`, { method: "POST", body: JSON.stringify(input) }, options) }
  /**
   * Resolve a short code to its stored destination (authenticated).
   * Convenience alias over GET /api/links/{shortCode}; no separate resolve endpoint exists.
   */
  async resolve(shortCode: string, options?: RequestOptions): Promise<ShortLinkDetail> { return this.getLink(shortCode, options) }
}

/** Create a QuickLink API client. Equivalent to `new QuickLinkClient(options)`. */
export function createClient(options: ClientOptions): QuickLinkClient { return new QuickLinkClient(options) }

/** Alias for the client class, convenient for type positions. */
export type Client = QuickLinkClient

