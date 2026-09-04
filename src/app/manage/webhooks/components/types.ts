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
};
