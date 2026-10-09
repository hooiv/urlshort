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
  folderIds: string[];
  /** Set for workspace endpoints (fire for every workspace link). */
  workspaceId: string | null;
  workspaceName: string | null;
};

export type WebhookLinkScope = 'all' | 'tags' | 'links' | 'folders';

export type WebhookLinkFilter = {
  linkScope: WebhookLinkScope;
  tags: string[];
  shortCodes: string[];
  folderIds: string[];
  workspaceId: string | null;
};
