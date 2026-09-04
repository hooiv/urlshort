export type OptimizationObjective = "conversion_rate" | "revenue_per_click" | "revenue" | "conversion_value";
export type CampaignVariant = {
    "id": string;
    "name": string;
    "destinationUrl": string;
    "weight": number;
    "enabled": boolean;
    "isControl": boolean;
    "clicks": number;
    "conversions": number;
    "valueCents": string;
};
export type Campaign = {
    "id": string;
    "workspaceId": string;
    "name": string;
    "slug": string;
    "status": string;
    "objective": OptimizationObjective;
    "version": number;
    "variants": Array<CampaignVariant>;
};
export type CreateCampaignInput = {
    "name": string;
    "slug": string;
    "objective"?: OptimizationObjective;
    "currency"?: string;
    "autoOptimize"?: boolean;
    "confidenceThreshold"?: number;
    "minSampleSize"?: number;
    "minConversions"?: number;
    "maxTrafficShiftPercent"?: number;
    "variants": Array<{
        "name": string;
        "destinationUrl": string;
        "weight": number;
        "isControl"?: boolean;
    }>;
};
export type ShortLink = {
    "id": string;
    "originalUrl": string;
    "shortCode": string;
    "shortUrl": string;
    "managementUrl"?: string | null;
    "title"?: string | null;
    "description"?: string | null;
    "ogImage"?: string | null;
    "clicks": number;
    "createdAt": string;
};
export type ShortLinkDetail = {
    "id": string;
    "originalUrl": string;
    "shortCode": string;
    "title"?: string | null;
    "description"?: string | null;
    "ogImage"?: string | null;
    "tags"?: Array<string>;
    "clicks"?: number;
    "createdAt"?: string;
    "updatedAt"?: string;
    "expiresAt"?: string | null;
    "expiredUrl"?: string | null;
    "maxClicks"?: number | null;
    "isActive"?: boolean;
    "cloaked"?: boolean;
    "webhookUrl"?: string | null;
    "metaPixelId"?: string | null;
    "googleTagId"?: string | null;
    "xPixelId"?: string | null;
    "riskStatus"?: string;
    "healthStatus"?: string;
};
export type CreateShortLinkInput = {
    "url": string;
    "customCode"?: string;
    "title"?: string;
    "description"?: string;
    "ogImage"?: string;
    "tags"?: Array<string>;
    "password"?: string;
    "expiresAt"?: string;
    "expiredUrl"?: string;
    "maxClicks"?: number;
    "workspaceId"?: string;
    "cloaked"?: boolean;
};
export type UpdateLinkInput = {
    "title"?: string | null;
    "description"?: string | null;
    "ogImage"?: string | null;
    "isActive"?: boolean;
    "tags"?: Array<string>;
    "expiresAt"?: string | null;
    "expiredUrl"?: string | null;
    "password"?: string | null;
    "destinationUrl"?: string;
    "maxClicks"?: number | null;
    "cloaked"?: boolean;
    "webhookUrl"?: string | null;
};
export type ListLinksResponse = {
    "links": Array<ShortLinkDetail>;
    "nextCursor"?: string | null;
};
export type DeleteLinkResult = {
    "deleted": boolean;
    "shortCode": string;
};
export type AnalyticsResponse = {
    "url": Record<string, unknown>;
    "window": Record<string, unknown>;
    "filters"?: Record<string, unknown>;
    "analytics": Record<string, unknown>;
};
export type WebhookEndpoint = {
    "id": string;
    "url": string;
    "isActive": boolean;
    "events": Array<string>;
    "createdAt": string;
    "updatedAt": string;
    "deliveriesCount"?: number;
    "secretHint"?: string;
};
export type WebhookEndpointWithSecret = {
    "id": string;
    "url": string;
    "isActive"?: boolean;
    "events"?: Array<string>;
    "secret": string;
    "createdAt"?: string;
    "updatedAt"?: string;
};
export type CreateWebhookInput = {
    "url": string;
    "events"?: Array<string>;
};
export type WebhookTestResult = {
    "success": boolean;
    "attempted"?: boolean;
    "deliveryId"?: string;
    "status"?: string;
    "statusCode"?: number | null;
    "latencyMs"?: number | null;
    "responseSnippet"?: string | null;
};
export type UnfurlInput = {
    "url": string;
};
export type UnfurlResult = {
    "url": string;
    "title"?: string | null;
    "description"?: string | null;
    "image"?: string | null;
    "icon"?: string | null;
    "siteName"?: string | null;
};
export type ApiErrorBody = {
    error: string;
    requestId?: string;
};
export type RequestOptions = {
    /** Forwarded as the `Idempotency-Key` header for safe retries of POST/PATCH writes. */
    idempotencyKey?: string;
    /** Caller-provided cancellation signal. The client never creates side effects after abort. */
    signal?: AbortSignal;
    /** Per-request timeout in milliseconds. Overrides the client default. `0` disables the timeout. */
    timeoutMs?: number;
};
export type ClientOptions = {
    /** Absolute base URL of the QuickLink deployment, e.g. `https://links.example.com`. */
    baseUrl: string;
    /** API key (`qlk_...`). Sent only in the `x-api-key` header; never logged or serialized. */
    apiKey: string;
    /** Injectable fetch implementation (tests, edge runtimes). Defaults to global fetch. */
    fetch?: typeof fetch;
    /** Default timeout in milliseconds applied to every request. Defaults to 15000. `0` disables it. */
    timeoutMs?: number;
};
/** Base error for every non-2xx QuickLink API response. */
export declare class QuickLinkError extends Error {
    readonly status: number;
    readonly body: ApiErrorBody;
    readonly code: string;
    readonly requestId?: string;
    /** Retry delay hint in seconds (only set for 429 rate-limit responses). */
    readonly retryAfter?: number;
    constructor(status: number, body: ApiErrorBody, init?: {
        code?: string;
        retryAfter?: number;
        requestId?: string;
    });
}
/** The API rate-limited the caller. Inspect `retryAfter` (seconds) before retrying. */
export declare class RateLimitError extends QuickLinkError {
    constructor(status: number, body: ApiErrorBody, retryAfter?: number);
    /** Alias for `retryAfter`: delay in seconds suggested via the `Retry-After` header. */
    get retryAfterSeconds(): number | undefined;
}
/** Authentication or authorization failed (HTTP 401/403). The key may be missing, revoked, or lack workspace permission. */
export declare class AuthenticationError extends QuickLinkError {
    constructor(status: number, body: ApiErrorBody);
}
/** The request was rejected as invalid (HTTP 400/409/422). Inspect `body.error` for the reason. */
export declare class ValidationError extends QuickLinkError {
    constructor(status: number, body: ApiErrorBody);
}
/** The referenced resource does not exist or is not visible to this key (HTTP 404). */
export declare class NotFoundError extends QuickLinkError {
    constructor(status: number, body: ApiErrorBody);
}
export declare class QuickLinkClient {
    private readonly baseUrl;
    private readonly apiKey;
    private readonly fetcher;
    private readonly timeoutMs;
    constructor(options: ClientOptions);
    /** Serialize without secrets: JSON.stringify(client) exposes only the base URL. */
    toJSON(): {
        baseUrl: string;
    };
    private request;
    listCampaigns(options?: RequestOptions): Promise<Array<Campaign>>;
    createCampaign(input: CreateCampaignInput, options?: RequestOptions): Promise<{
        "campaign": Campaign;
    }>;
    getCampaign(campaignId: string, options?: RequestOptions): Promise<Campaign>;
    shorten(input: CreateShortLinkInput, options?: RequestOptions): Promise<ShortLink>;
    listLinks(query?: {
        "search"?: string;
        "tag"?: string;
        "cursor"?: string;
        "take"?: number;
    }, options?: RequestOptions): Promise<ListLinksResponse>;
    getLink(shortCode: string, options?: RequestOptions): Promise<ShortLinkDetail>;
    updateLink(shortCode: string, input: UpdateLinkInput, options?: RequestOptions): Promise<ShortLinkDetail>;
    deleteLink(shortCode: string, options?: RequestOptions): Promise<DeleteLinkResult>;
    getAnalytics(shortCode: string, query?: {
        "range"?: string;
        "from"?: string;
        "to"?: string;
        "country"?: string;
        "device"?: string;
        "referrer"?: string;
        "ruleId"?: string;
    }, options?: RequestOptions): Promise<AnalyticsResponse>;
    listWebhooks(options?: RequestOptions): Promise<Array<WebhookEndpoint>>;
    createWebhook(input: CreateWebhookInput, options?: RequestOptions): Promise<WebhookEndpointWithSecret>;
    deleteWebhook(id: string, options?: RequestOptions): Promise<void>;
    testWebhook(id: string, options?: RequestOptions): Promise<WebhookTestResult>;
    unfurlUrl(input: UnfurlInput, options?: RequestOptions): Promise<UnfurlResult>;
    /**
     * Resolve a short code to its stored destination (authenticated).
     * Convenience alias over GET /api/links/{shortCode}; no separate resolve endpoint exists.
     */
    resolve(shortCode: string, options?: RequestOptions): Promise<ShortLinkDetail>;
}
/** Create a QuickLink API client. Equivalent to `new QuickLinkClient(options)`. */
export declare function createClient(options: ClientOptions): QuickLinkClient;
/** Alias for the client class, convenient for type positions. */
export type Client = QuickLinkClient;
