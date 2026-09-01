// GENERATED FROM openapi.json - DO NOT EDIT


export type OptimizationObjective = "conversion_rate" | "revenue_per_click" | "revenue" | "conversion_value"
export type CampaignVariant = { "id": string; "name": string; "destinationUrl": string; "weight": number; "enabled": boolean; "isControl": boolean; "clicks": number; "conversions": number; "valueCents": string }
export type Campaign = { "id": string; "workspaceId": string; "name": string; "slug": string; "status": string; "objective": OptimizationObjective; "version": number; "variants": Array<CampaignVariant> }
export type CreateCampaignInput = { "name": string; "slug": string; "objective"?: OptimizationObjective; "currency"?: string; "autoOptimize"?: boolean; "confidenceThreshold"?: number; "minSampleSize"?: number; "minConversions"?: number; "maxTrafficShiftPercent"?: number; "variants": Array<{ "name": string; "destinationUrl": string; "weight": number; "isControl"?: boolean }> }

export type ApiError = { error: string; requestId?: string }
export type RequestOptions = { idempotencyKey?: string; signal?: AbortSignal }
export class QuickLinkError extends Error { constructor(readonly status: number, readonly body: ApiError) { super(body.error); this.name = "QuickLinkError" } }

export class QuickLinkClient {
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly fetcher: typeof fetch
  constructor(options: { baseUrl: string; apiKey: string; fetch?: typeof fetch }) { this.baseUrl = options.baseUrl.replace(/\/$/, ""); this.apiKey = options.apiKey; this.fetcher = options.fetch ?? fetch }
  private async request<T>(path: string, init: RequestInit = {}, options: RequestOptions = {}): Promise<T> {
    const headers = new Headers(init.headers); headers.set("accept", "application/json"); headers.set("content-type", "application/json"); headers.set("x-api-key", this.apiKey); if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey)
    const response = await this.fetcher(`${this.baseUrl}${path}`, { ...init, headers, signal: options.signal }); const body = await response.json().catch(() => null)
    if (!response.ok) throw new QuickLinkError(response.status, body && typeof body === "object" && "error" in body ? body : { error: `HTTP ${response.status}` })
    return body as T
  }
  listCampaigns(options?: RequestOptions): Promise<Array<Campaign>> { return this.request<Array<Campaign>>(`/api/v1/campaigns`, {}, options) }
  createCampaign(input: CreateCampaignInput, options?: RequestOptions): Promise<{ "campaign": Campaign }> { return this.request<{ "campaign": Campaign }>(`/api/v1/campaigns/create`, { method: "POST", body: JSON.stringify(input) }, options) }
  getCampaign(campaignId: string, options?: RequestOptions): Promise<Campaign> { return this.request<Campaign>(`/api/campaigns/${encodeURIComponent(campaignId)}`, {}, options) }
}

