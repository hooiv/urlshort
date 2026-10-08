export type Webhook = {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
  /** Normalized delivery count (the API exposes `deliveriesCount`). */
  deliveries: number;
  secretHint?: string;
  linkScope: WebhookLinkScope;
  tags: string[];
  shortCodes: string[];
};

export type WebhookLinkScope = 'all' | 'tags' | 'links';

export type WebhookLinkFilter = {
  linkScope: WebhookLinkScope;
  tags: string[];
  shortCodes: string[];
};
