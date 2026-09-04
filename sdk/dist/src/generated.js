// GENERATED FROM openapi.json - DO NOT EDIT
// Generator: sdk/scripts/generate.mjs (spot-checked against src/app/api route handlers).
// To change this file, edit sdk/openapi.json (additive corrections only) or the generator,
// then run `npm run generate`. Hand-written helpers live in sdk/src/client.ts.
/** Base error for every non-2xx QuickLink API response. */
export class QuickLinkError extends Error {
    constructor(status, body, init = {}) {
        super(body?.error || `HTTP ${status}`);
        this.name = "QuickLinkError";
        this.status = status;
        this.body = body;
        this.code = init.code ?? `http_${status}`;
        if (init.requestId ?? body?.requestId)
            this.requestId = init.requestId ?? body.requestId;
        if (init.retryAfter !== undefined)
            this.retryAfter = init.retryAfter;
    }
}
/** The API rate-limited the caller. Inspect `retryAfter` (seconds) before retrying. */
export class RateLimitError extends QuickLinkError {
    constructor(status, body, retryAfter) {
        super(status, body, { code: "rate_limited", retryAfter, requestId: body?.requestId });
        this.name = "RateLimitError";
    }
    /** Alias for `retryAfter`: delay in seconds suggested via the `Retry-After` header. */
    get retryAfterSeconds() { return this.retryAfter; }
}
/** Authentication or authorization failed (HTTP 401/403). The key may be missing, revoked, or lack workspace permission. */
export class AuthenticationError extends QuickLinkError {
    constructor(status, body) {
        super(status, body, { code: status === 403 ? "forbidden" : "unauthorized", requestId: body?.requestId });
        this.name = "AuthenticationError";
    }
}
/** The request was rejected as invalid (HTTP 400/409/422). Inspect `body.error` for the reason. */
export class ValidationError extends QuickLinkError {
    constructor(status, body) {
        const code = status === 409 ? "conflict" : status === 422 ? "unprocessable" : "bad_request";
        super(status, body, { code, requestId: body?.requestId });
        this.name = "ValidationError";
    }
}
/** The referenced resource does not exist or is not visible to this key (HTTP 404). */
export class NotFoundError extends QuickLinkError {
    constructor(status, body) {
        super(status, body, { code: "not_found", requestId: body?.requestId });
        this.name = "NotFoundError";
    }
}
function safeJsonParse(text) {
    try {
        return JSON.parse(text);
    }
    catch {
        return null;
    }
}
/** Parse a `Retry-After` header (seconds or HTTP date) into seconds. */
function parseRetryAfterSeconds(value) {
    if (!value)
        return undefined;
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed))
        return Number.parseInt(trimmed, 10);
    const when = Date.parse(trimmed);
    if (!Number.isNaN(when))
        return Math.max(0, Math.ceil((when - Date.now()) / 1000));
    return undefined;
}
function toApiErrorBody(status, body) {
    if (body !== null && typeof body === "object" && "error" in body) {
        const record = body;
        if (typeof record.error === "string" && record.error) {
            const out = { error: record.error };
            if (typeof record.requestId === "string")
                out.requestId = record.requestId;
            return out;
        }
    }
    return { error: `HTTP ${status}` };
}
function throwApiError(status, body, headers) {
    const normalized = toApiErrorBody(status, body);
    if (status === 429)
        throw new RateLimitError(status, normalized, parseRetryAfterSeconds(headers.get("Retry-After")));
    if (status === 401 || status === 403)
        throw new AuthenticationError(status, normalized);
    if (status === 400 || status === 409 || status === 422)
        throw new ValidationError(status, normalized);
    if (status === 404)
        throw new NotFoundError(status, normalized);
    throw new QuickLinkError(status, normalized);
}
function appendQuery(route, query) {
    if (!query)
        return route;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null)
            continue;
        if (Array.isArray(value)) {
            for (const item of value) {
                if (item !== undefined && item !== null)
                    params.append(key, String(item));
            }
        }
        else {
            params.append(key, String(value));
        }
    }
    const qs = params.toString();
    return qs ? `${route}?${qs}` : route;
}
export class QuickLinkClient {
    constructor(options) {
        if (!options || typeof options.baseUrl !== "string" || !options.baseUrl.trim()) {
            throw new TypeError("QuickLinkClient: baseUrl is required");
        }
        if (!options || typeof options.apiKey !== "string" || !options.apiKey) {
            throw new TypeError("QuickLinkClient: apiKey is required");
        }
        const normalized = options.baseUrl.trim().replace(/\/+$/, "");
        try {
            const parsed = new URL(normalized);
            if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
                throw new TypeError("bad protocol");
        }
        catch {
            throw new TypeError("QuickLinkClient: baseUrl must be an absolute http(s) URL");
        }
        const fetcher = options.fetch ?? globalThis.fetch;
        if (typeof fetcher !== "function")
            throw new TypeError("QuickLinkClient: a fetch implementation is required");
        this.baseUrl = normalized;
        // SECURITY: the key is stored privately, sent only as the `x-api-key` header,
        // and never written to logs, errors, or serialized output (see toJSON below).
        this.apiKey = options.apiKey;
        this.fetcher = fetcher;
        this.timeoutMs = options.timeoutMs ?? 15000;
    }
    /** Serialize without secrets: JSON.stringify(client) exposes only the base URL. */
    toJSON() { return { baseUrl: this.baseUrl }; }
    async request(path, init = {}, options = {}) {
        const headers = new Headers(init.headers);
        headers.set("accept", "application/json");
        if (init.body !== undefined && init.body !== null)
            headers.set("content-type", "application/json");
        headers.set("x-api-key", this.apiKey);
        if (options.idempotencyKey)
            headers.set("Idempotency-Key", options.idempotencyKey);
        const timeoutMs = options.timeoutMs ?? this.timeoutMs;
        const inputSignal = options.signal;
        if (inputSignal?.aborted)
            throw (inputSignal.reason ?? new DOMException("The operation was aborted.", "AbortError"));
        const controller = new AbortController();
        const onAbort = () => { controller.abort(inputSignal?.reason); };
        let timer;
        let timedOut = false;
        try {
            if (inputSignal)
                inputSignal.addEventListener("abort", onAbort, { once: true });
            if (timeoutMs > 0) {
                timer = setTimeout(() => {
                    timedOut = true;
                    controller.abort(new DOMException(`Request timed out after ${timeoutMs}ms`, "TimeoutError"));
                }, timeoutMs);
            }
            let response;
            try {
                response = await this.fetcher(`${this.baseUrl}${path}`, { ...init, headers, signal: controller.signal });
            }
            catch (error) {
                if (timedOut)
                    throw new DOMException(`Request timed out after ${timeoutMs}ms`, "TimeoutError");
                throw error;
            }
            if (response.status === 204)
                return undefined;
            const text = await response.text().catch(() => "");
            const parsed = text ? safeJsonParse(text) : null;
            if (!response.ok)
                throwApiError(response.status, parsed, response.headers);
            if (parsed === null || parsed === undefined)
                return undefined;
            return parsed;
        }
        finally {
            if (timer !== undefined)
                clearTimeout(timer);
            if (inputSignal)
                inputSignal.removeEventListener("abort", onAbort);
        }
    }
    listCampaigns(options) { return this.request(`/api/v1/campaigns`, { method: "GET" }, options); }
    createCampaign(input, options) { return this.request(`/api/v1/campaigns/create`, { method: "POST", body: JSON.stringify(input) }, options); }
    getCampaign(campaignId, options) { return this.request(`/api/campaigns/${encodeURIComponent(campaignId)}`, { method: "GET" }, options); }
    shorten(input, options) { return this.request(`/api/shorten`, { method: "POST", body: JSON.stringify(input) }, options); }
    listLinks(query, options) { return this.request(appendQuery(`/api/shorten`, query), { method: "GET" }, options); }
    getLink(shortCode, options) { return this.request(`/api/links/${encodeURIComponent(shortCode)}`, { method: "GET" }, options); }
    updateLink(shortCode, input, options) { return this.request(`/api/links/${encodeURIComponent(shortCode)}`, { method: "PATCH", body: JSON.stringify(input) }, options); }
    deleteLink(shortCode, options) { return this.request(`/api/links/${encodeURIComponent(shortCode)}`, { method: "DELETE" }, options); }
    getAnalytics(shortCode, query, options) { return this.request(appendQuery(`/api/analytics/${encodeURIComponent(shortCode)}`, query), { method: "GET" }, options); }
    listWebhooks(options) { return this.request(`/api/webhooks`, { method: "GET" }, options); }
    createWebhook(input, options) { return this.request(`/api/webhooks`, { method: "POST", body: JSON.stringify(input) }, options); }
    deleteWebhook(id, options) { return this.request(`/api/webhooks/${encodeURIComponent(id)}`, { method: "DELETE" }, options); }
    testWebhook(id, options) { return this.request(`/api/webhooks/${encodeURIComponent(id)}/test`, { method: "POST" }, options); }
    unfurlUrl(input, options) { return this.request(`/api/unfurl`, { method: "POST", body: JSON.stringify(input) }, options); }
    /**
     * Resolve a short code to its stored destination (authenticated).
     * Convenience alias over GET /api/links/{shortCode}; no separate resolve endpoint exists.
     */
    async resolve(shortCode, options) { return this.getLink(shortCode, options); }
}
/** Create a QuickLink API client. Equivalent to `new QuickLinkClient(options)`. */
export function createClient(options) { return new QuickLinkClient(options); }
