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
export type ApiError = {
    error: string;
    requestId?: string;
};
export type RequestOptions = {
    idempotencyKey?: string;
    signal?: AbortSignal;
};
export declare class QuickLinkError extends Error {
    readonly status: number;
    readonly body: ApiError;
    constructor(status: number, body: ApiError);
}
export declare class QuickLinkClient {
    private readonly baseUrl;
    private readonly apiKey;
    private readonly fetcher;
    constructor(options: {
        baseUrl: string;
        apiKey: string;
        fetch?: typeof fetch;
    });
    private request;
    listCampaigns(options?: RequestOptions): Promise<Array<Campaign>>;
    createCampaign(input: CreateCampaignInput, options?: RequestOptions): Promise<{
        "campaign": Campaign;
    }>;
    getCampaign(campaignId: string, options?: RequestOptions): Promise<Campaign>;
}
