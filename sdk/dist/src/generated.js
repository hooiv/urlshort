// GENERATED FROM openapi.json - DO NOT EDIT
export class QuickLinkError extends Error {
    constructor(status, body) {
        super(body.error);
        this.status = status;
        this.body = body;
        this.name = "QuickLinkError";
    }
}
export class QuickLinkClient {
    constructor(options) { this.baseUrl = options.baseUrl.replace(/\/$/, ""); this.apiKey = options.apiKey; this.fetcher = options.fetch ?? fetch; }
    async request(path, init = {}, options = {}) {
        const headers = new Headers(init.headers);
        headers.set("accept", "application/json");
        headers.set("content-type", "application/json");
        headers.set("x-api-key", this.apiKey);
        if (options.idempotencyKey)
            headers.set("Idempotency-Key", options.idempotencyKey);
        const response = await this.fetcher(`${this.baseUrl}${path}`, { ...init, headers, signal: options.signal });
        const body = await response.json().catch(() => null);
        if (!response.ok)
            throw new QuickLinkError(response.status, body && typeof body === "object" && "error" in body ? body : { error: `HTTP ${response.status}` });
        return body;
    }
    listCampaigns(options) { return this.request(`/api/v1/campaigns`, {}, options); }
    createCampaign(input, options) { return this.request(`/api/v1/campaigns/create`, { method: "POST", body: JSON.stringify(input) }, options); }
    getCampaign(campaignId, options) { return this.request(`/api/campaigns/${encodeURIComponent(campaignId)}`, {}, options); }
}
